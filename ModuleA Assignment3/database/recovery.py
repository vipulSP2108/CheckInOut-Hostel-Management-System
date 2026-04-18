"""
recovery.py  –  Crash Recovery Manager for Module A, Assignment 3
==================================================================

ARIES-inspired recovery (simplified for an in-memory B+ Tree engine)
---------------------------------------------------------------------

The recovery algorithm has three passes over the WAL:

  1. Analysis pass
     Scan the entire WAL to classify every transaction as:
       - COMMITTED  (BEGIN … COMMIT seen)
       - ABORTED    (BEGIN … ABORT  seen)
       - ACTIVE     (BEGIN seen, no COMMIT / ABORT) → these are "losers"

  2. Redo pass
     Re-apply every INSERT / UPDATE / DELETE that belongs to a COMMITTED
     transaction, in LSN order.  This rebuilds the committed state.

  3. Undo pass (loser transactions)
     For each "loser" (ACTIVE at crash time) reverse its ops in reverse
     LSN order using the before-images stored in the WAL.
     Write ABORT records for each one so the WAL is self-consistent.

After recovery the DatabaseManager reflects exactly the last consistent
committed state.

Usage
-----
    rm = RecoveryManager(db_manager, wal_path="data/wal.log")
    report = rm.recover()          # call once at startup
    print(report.summary())
"""

from __future__ import annotations
import copy
from dataclasses import dataclass, field
from typing import Any

from .wal import WALManager, WALRecord, OP_BEGIN, OP_INSERT, OP_UPDATE, OP_DELETE, OP_COMMIT, OP_ABORT


# ── Recovery report ──────────────────────────────────────────────────────────
@dataclass
class RecoveryReport:
    committed_txns:  list[str] = field(default_factory=list)
    aborted_txns:    list[str] = field(default_factory=list)
    loser_txns:      list[str] = field(default_factory=list)
    redo_ops:        int = 0
    undo_ops:        int = 0
    errors:          list[str] = field(default_factory=list)

    def summary(self) -> str:
        lines = [
            "═" * 55,
            "  CRASH RECOVERY REPORT",
            "═" * 55,
            f"  Committed transactions  : {len(self.committed_txns)}  {self.committed_txns}",
            f"  Aborted  transactions   : {len(self.aborted_txns)}  {self.aborted_txns}",
            f"  Loser    transactions   : {len(self.loser_txns)}  {self.loser_txns}",
            f"  Redo operations applied : {self.redo_ops}",
            f"  Undo operations applied : {self.undo_ops}",
        ]
        if self.errors:
            lines.append(f"  Errors : {self.errors}")
        else:
            lines.append("  Status : CLEAN – database is consistent")
        lines.append("═" * 55)
        return "\n".join(lines)


# ── Recovery Manager ─────────────────────────────────────────────────────────
class RecoveryManager:
    """
    Replays the WAL to restore the database to the last consistent state.

    Parameters
    ----------
    db_manager : DatabaseManager  – the (empty or partially loaded) DBMS
    wal_path   : str              – path of the WAL file
    """

    def __init__(self, db_manager, wal_path: str = "data/wal.log"):
        self._db  = db_manager
        self._wal = WALManager(log_path=wal_path)

    def recover(self) -> RecoveryReport:
        """
        Run the three-pass ARIES recovery algorithm.
        Returns a RecoveryReport describing what was done.
        """
        report = RecoveryReport()
        records = self._wal.read_all()

        if not records:
            return report   # nothing to recover

        # ── Pass 1: Analysis ─────────────────────────────────────────────────
        txn_status: dict[str, str] = {}          # txn_id → "ACTIVE"|"COMMITTED"|"ABORTED"
        txn_records: dict[str, list[WALRecord]] = {}  # txn_id → [WALRecord, ...]

        for rec in records:
            txn_records.setdefault(rec.txn_id, []).append(rec)
            if rec.op == OP_BEGIN:
                txn_status[rec.txn_id] = "ACTIVE"
            elif rec.op == OP_COMMIT:
                txn_status[rec.txn_id] = "COMMITTED"
            elif rec.op == OP_ABORT:
                txn_status[rec.txn_id] = "ABORTED"

        for txn_id, status in txn_status.items():
            if status == "COMMITTED":
                report.committed_txns.append(txn_id)
            elif status == "ABORTED":
                report.aborted_txns.append(txn_id)
            else:
                report.loser_txns.append(txn_id)   # crashed mid-transaction

        # ── Pass 2: Redo (committed txns only) ──────────────────────────────
        for rec in records:
            if txn_status.get(rec.txn_id) != "COMMITTED":
                continue
            if rec.op not in (OP_INSERT, OP_UPDATE, OP_DELETE):
                continue
            err = self._apply_redo(rec)
            if err:
                report.errors.append(err)
            else:
                report.redo_ops += 1

        # ── Pass 3: Undo (loser txns only) ──────────────────────────────────
        for txn_id in report.loser_txns:
            recs = [r for r in txn_records.get(txn_id, [])
                    if r.op in (OP_INSERT, OP_UPDATE, OP_DELETE)]
            for rec in reversed(recs):    # reverse LSN order
                err = self._apply_undo(rec)
                if err:
                    report.errors.append(err)
                else:
                    report.undo_ops += 1
            # Mark as aborted in WAL so future recoveries skip it
            self._wal.append(txn_id, OP_ABORT)

        return report

    # ── Redo helper ──────────────────────────────────────────────────────────
    def _apply_redo(self, rec: WALRecord) -> str | None:
        """
        Re-apply a committed operation.
        Returns None on success, or an error string on failure.
        """
        try:
            tbl = self._db.get_table(rec.table)
        except KeyError:
            return f"REDO: table '{rec.table}' not found – skipped lsn={rec.lsn}"

        try:
            if rec.op == OP_INSERT:
                # Idempotent: skip if row already exists (could have been applied before crash)
                if tbl.select(rec.key) is None:
                    tbl.insert_row(copy.deepcopy(rec.after))
            elif rec.op == OP_UPDATE:
                if tbl.select(rec.key) is not None:
                    tbl.update_row(rec.key, copy.deepcopy(rec.after))
            elif rec.op == OP_DELETE:
                if tbl.select(rec.key) is not None:
                    tbl.delete_row(rec.key)
        except Exception as exc:
            return f"REDO error lsn={rec.lsn} op={rec.op} key={rec.key}: {exc}"

        return None

    # ── Undo helper ──────────────────────────────────────────────────────────
    def _apply_undo(self, rec: WALRecord) -> str | None:
        """
        Reverse an uncommitted operation using its before-image.
        Returns None on success, or an error string on failure.
        """
        try:
            tbl = self._db.get_table(rec.table)
        except KeyError:
            return f"UNDO: table '{rec.table}' not found – skipped lsn={rec.lsn}"

        try:
            if rec.op == OP_INSERT:
                # Undo of INSERT → DELETE the row (it was never committed)
                if tbl.select(rec.key) is not None:
                    tbl.delete_row(rec.key)
            elif rec.op == OP_UPDATE:
                # Undo of UPDATE → restore before-image
                if tbl.select(rec.key) is not None and rec.before is not None:
                    tbl.update_row(rec.key, copy.deepcopy(rec.before))
            elif rec.op == OP_DELETE:
                # Undo of DELETE → re-insert before-image
                if tbl.select(rec.key) is None and rec.before is not None:
                    tbl.insert_row(copy.deepcopy(rec.before))
        except Exception as exc:
            return f"UNDO error lsn={rec.lsn} op={rec.op} key={rec.key}: {exc}"

        return None

    # ── Checkpoint ───────────────────────────────────────────────────────────
    def checkpoint(self) -> None:
        """
        Take a checkpoint: truncate the WAL (all current data is safely
        in the DB).  Call only when no transactions are active.
        """
        self._wal.truncate()

    def __repr__(self):
        return f"RecoveryManager(db={self._db.name!r}, wal={self._wal._path!r})"
