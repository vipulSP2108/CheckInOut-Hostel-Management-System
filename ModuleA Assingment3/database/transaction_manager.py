"""
transaction_manager.py  –  Transaction Manager for Module A, Assignment 3
==========================================================================

ACID guarantees provided
------------------------
A – Atomicity   : all ops in a txn apply together or none do (rollback undoes them)
C – Consistency : the DB is always in a valid state; constraints hold before & after
I – Isolation   : each txn sees a snapshot of committed data; dirty reads blocked
D – Durability  : committed txns are written to WAL before any response is returned

Architecture
------------
  TransactionManager
    ├── WALManager         (persistent append-only log)
    ├── Transaction[T1]    (in-flight op buffer + before-images)
    └── Transaction[T2]
    
Each Transaction keeps a list of pending operations in memory.  On COMMIT they are
applied to the actual DatabaseManager and the COMMIT record is fsynced to the WAL.
On ROLLBACK (or crash recovery) the pending list is discarded and the WAL records
ABORT.

Isolation level: READ COMMITTED
  - A transaction sees only data committed by other transactions before it started.
  - Dirty reads are prevented because pending ops live only in the Transaction buffer
    and never touch the shared DatabaseManager until commit.
"""

from __future__ import annotations
import copy
import threading
import uuid
from typing import Any

from .wal import WALManager, OP_BEGIN, OP_INSERT, OP_UPDATE, OP_DELETE, OP_COMMIT, OP_ABORT


# ── Transaction states ───────────────────────────────────────────────────────
class TxnState:
    ACTIVE    = "ACTIVE"
    COMMITTED = "COMMITTED"
    ABORTED   = "ABORTED"


# ── Pending operation record (lives only in memory) ─────────────────────────
class PendingOp:
    __slots__ = ("op", "table", "key", "before", "after")

    def __init__(self, op: str, table: str, key: Any,
                 before: Any = None, after: Any = None):
        self.op     = op
        self.table  = table
        self.key    = key
        self.before = before
        self.after  = after


# ── Single transaction object ────────────────────────────────────────────────
class Transaction:
    """
    Tracks all operations belonging to one logical transaction.

    The buffer holds PendingOps in arrival order.  On commit they are
    applied sequentially; on rollback they are discarded.
    """

    def __init__(self, txn_id: str, wal: WALManager):
        self.txn_id = txn_id
        self.state  = TxnState.ACTIVE
        self._wal   = wal
        self._ops: list[PendingOp] = []

    # ── Buffer an operation ──────────────────────────────────────────────────
    def record_insert(self, table: str, key: Any, row: dict) -> None:
        self._assert_active()
        self._wal.append(self.txn_id, OP_INSERT, table, key, before=None, after=copy.deepcopy(row))
        self._ops.append(PendingOp(OP_INSERT, table, key, before=None, after=copy.deepcopy(row)))

    def record_update(self, table: str, key: Any, before: dict, after: dict) -> None:
        self._assert_active()
        self._wal.append(self.txn_id, OP_UPDATE, table, key,
                         before=copy.deepcopy(before), after=copy.deepcopy(after))
        self._ops.append(PendingOp(OP_UPDATE, table, key,
                                   before=copy.deepcopy(before), after=copy.deepcopy(after)))

    def record_delete(self, table: str, key: Any, before: dict) -> None:
        self._assert_active()
        self._wal.append(self.txn_id, OP_DELETE, table, key,
                         before=copy.deepcopy(before), after=None)
        self._ops.append(PendingOp(OP_DELETE, table, key,
                                   before=copy.deepcopy(before), after=None))

    # ── Accessors ────────────────────────────────────────────────────────────
    @property
    def ops(self) -> list[PendingOp]:
        return list(self._ops)   # defensive copy

    def _assert_active(self):
        if self.state != TxnState.ACTIVE:
            raise RuntimeError(
                f"Transaction {self.txn_id} is already {self.state}; "
                "cannot buffer more operations."
            )

    def __repr__(self):
        return (f"Transaction(id={self.txn_id!r}, state={self.state}, "
                f"ops={len(self._ops)})")


# ── Transaction Manager ──────────────────────────────────────────────────────
class TransactionManager:
    """
    Coordinates transactions over a DatabaseManager instance.

    Parameters
    ----------
    db_manager : DatabaseManager   – the underlying in-memory DBMS
    wal_path   : str               – path for the WAL file
    """

    def __init__(self, db_manager, wal_path: str = "data/wal.log"):
        self._db   = db_manager
        self._wal  = WALManager(log_path=wal_path)
        self._txns: dict[str, Transaction] = {}
        self._lock = threading.Lock()   # guard the active-txn registry

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    def begin(self) -> str:
        """Start a new transaction. Returns the transaction ID (UUID)."""
        txn_id = f"T-{uuid.uuid4().hex[:8].upper()}"
        self._wal.append(txn_id, OP_BEGIN)
        txn = Transaction(txn_id, self._wal)
        with self._lock:
            self._txns[txn_id] = txn
        return txn_id

    def commit(self, txn_id: str) -> None:
        """
        Apply all buffered ops to the DatabaseManager, then write COMMIT to WAL.
        Raises RuntimeError if the transaction is not active.
        """
        txn = self._get_active(txn_id)

        # Apply ops to the actual B+ Tree backed tables
        try:
            self._apply_ops(txn.ops)
        except Exception as exc:
            # If apply fails mid-way, roll back what we already applied
            self._undo_partial(txn.ops)
            self._wal.append(txn_id, OP_ABORT)
            txn.state = TxnState.ABORTED
            raise RuntimeError(
                f"Commit of {txn_id} failed during apply – auto-rolled back."
            ) from exc

        # WAL COMMIT record fsynced before we return (durability)
        self._wal.append(txn_id, OP_COMMIT)
        txn.state = TxnState.COMMITTED

        with self._lock:
            del self._txns[txn_id]

    def rollback(self, txn_id: str) -> None:
        """
        Discard all buffered ops (no changes were ever written to the DB),
        then write ABORT to WAL.
        """
        txn = self._get_active(txn_id)
        self._wal.append(txn_id, OP_ABORT)
        txn.state = TxnState.ABORTED

        with self._lock:
            del self._txns[txn_id]

    # ── DML wrappers (use these instead of direct DB calls) ───────────────────
    def insert(self, txn_id: str, table_name: str, row: dict) -> None:
        """Buffer an INSERT for the given transaction."""
        txn = self._get_active(txn_id)
        key = row[self._db.get_table(table_name).pk_column]
        # Check for duplicate PK (reads committed state + txn's own inserts)
        if self._txn_visible_select(txn, table_name, key) is not None:
            raise ValueError(
                f"Duplicate primary key {key!r} in '{table_name}'"
            )
        txn.record_insert(table_name, key, row)

    def update(self, txn_id: str, table_name: str, pk_value, updates: dict) -> bool:
        """Buffer an UPDATE. Returns False if the row does not exist."""
        txn = self._get_active(txn_id)
        before = self._txn_visible_select(txn, table_name, pk_value)
        if before is None:
            return False
        after = {**before, **updates}
        txn.record_update(table_name, pk_value, before, after)
        return True

    def delete(self, txn_id: str, table_name: str, pk_value) -> bool:
        """Buffer a DELETE. Returns False if the row does not exist."""
        txn = self._get_active(txn_id)
        before = self._txn_visible_select(txn, table_name, pk_value)
        if before is None:
            return False
        txn.record_delete(table_name, pk_value, before)
        return True

    def select(self, txn_id: str, table_name: str, pk_value) -> dict | None:
        """
        Read-consistent SELECT: returns committed state of the row.
        (Dirty reads from other in-flight txns are never visible.)
        """
        txn = self._get_active(txn_id)
        return self._txn_visible_select(txn, table_name, pk_value)

    def select_all(self, txn_id: str, table_name: str) -> list[dict]:
        """Return all committed rows, applying this txn's own buffered ops."""
        txn = self._get_active(txn_id)
        # Start from committed state
        rows = {r[self._db.get_table(table_name).pk_column]: dict(r)
                for r in self._db.select_all(table_name)}
        # Apply this txn's own buffered ops on top
        for op in txn.ops:
            if op.table != table_name:
                continue
            pk_col = self._db.get_table(table_name).pk_column
            if op.op == OP_INSERT:
                rows[op.key] = op.after
            elif op.op == OP_UPDATE:
                if op.key in rows:
                    rows[op.key] = op.after
            elif op.op == OP_DELETE:
                rows.pop(op.key, None)
        return sorted(rows.values(), key=lambda r: r[self._db.get_table(table_name).pk_column])

    # ── Internal helpers ──────────────────────────────────────────────────────
    def _get_active(self, txn_id: str) -> Transaction:
        with self._lock:
            txn = self._txns.get(txn_id)
        if txn is None or txn.state != TxnState.ACTIVE:
            raise RuntimeError(
                f"No active transaction with id '{txn_id}'. "
                "Call begin() first."
            )
        return txn

    def _txn_visible_select(self, txn: Transaction, table_name: str, pk_value) -> dict | None:
        """
        Return the row as this transaction sees it:
        committed state  +  own buffered mutations.
        """
        row = self._db.select(table_name, pk_value)
        row = dict(row) if row else None

        for op in txn.ops:
            if op.table != table_name or op.key != pk_value:
                continue
            if op.op == OP_INSERT:
                row = dict(op.after)
            elif op.op == OP_UPDATE:
                row = dict(op.after)
            elif op.op == OP_DELETE:
                row = None
        return row

    def _apply_ops(self, ops: list[PendingOp]) -> None:
        """Apply a list of ops to the DatabaseManager in order."""
        applied: list[PendingOp] = []
        for op in ops:
            tbl = self._db.get_table(op.table)
            if op.op == OP_INSERT:
                tbl.insert_row(op.after)
            elif op.op == OP_UPDATE:
                tbl.update_row(op.key, op.after)
            elif op.op == OP_DELETE:
                tbl.delete_row(op.key)
            applied.append(op)

    def _undo_partial(self, ops: list[PendingOp]) -> None:
        """
        Undo a partial application of ops in reverse order.
        Used when commit fails mid-apply.
        """
        for op in reversed(ops):
            try:
                tbl = self._db.get_table(op.table)
                if op.op == OP_INSERT:
                    tbl.delete_row(op.key)
                elif op.op == OP_UPDATE:
                    tbl.update_row(op.key, op.before)
                elif op.op == OP_DELETE:
                    tbl.insert_row(op.before)
            except Exception:
                pass   # best-effort undo; recovery will clean up on restart

    # ── Status helpers ────────────────────────────────────────────────────────
    def active_transactions(self) -> list[str]:
        with self._lock:
            return list(self._txns.keys())

    @property
    def wal(self) -> WALManager:
        return self._wal

    def __repr__(self):
        active = self.active_transactions()
        return (f"TransactionManager(db={self._db.name!r}, "
                f"active_txns={active})")
