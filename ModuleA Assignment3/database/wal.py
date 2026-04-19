"""
wal.py   Write-Ahead Log (WAL) for Module A, Assignment 3

Design
------
Every mutating operation is written to the WAL *before* it touches the
in-memory B+ Tree.  Each record is a JSON line:

    {"lsn": 1, "txn_id": "T1", "op": "BEGIN",  "ts": "..."}
    {"lsn": 2, "txn_id": "T1", "op": "INSERT", "table": "students",
     "key": 1, "before": null, "after": {"id":1,"name":"Alice"}, "ts": "..."}
    {"lsn": 3, "txn_id": "T1", "op": "COMMIT", "ts": "..."}

op types
--------
BEGIN, INSERT, UPDATE, DELETE, COMMIT, ABORT

The WAL guarantees:
  - Atomicity  : on rollback / crash, un-committed ops are never applied.
  - Durability : committed records survive restarts (file is fsynced).
"""

from __future__ import annotations
import json
import os
import threading
import time
from typing import Any

# op-type constants
OP_BEGIN  = "BEGIN"
OP_INSERT = "INSERT"
OP_UPDATE = "UPDATE"
OP_DELETE = "DELETE"
OP_COMMIT = "COMMIT"
OP_ABORT  = "ABORT"


class WALRecord:
    """One immutable WAL log entry."""

    __slots__ = ("lsn", "txn_id", "op", "table", "key", "before", "after", "ts")

    def __init__(
        self,
        lsn: int,
        txn_id: str,
        op: str,
        table: str | None = None,
        key: Any = None,
        before: Any = None,
        after: Any = None,
    ):
        self.lsn    = lsn
        self.txn_id = txn_id
        self.op     = op
        self.table  = table
        self.key    = key
        self.before = before
        self.after  = after
        self.ts     = time.strftime("%Y-%m-%dT%H:%M:%S")

    def to_dict(self) -> dict:
        return {
            "lsn":    self.lsn,
            "txn_id": self.txn_id,
            "op":     self.op,
            "table":  self.table,
            "key":    self.key,
            "before": self.before,
            "after":  self.after,
            "ts":     self.ts,
        }

    @staticmethod
    def from_dict(d: dict) -> "WALRecord":
        r = WALRecord(
            lsn    = d["lsn"],
            txn_id = d["txn_id"],
            op     = d["op"],
            table  = d.get("table"),
            key    = d.get("key"),
            before = d.get("before"),
            after  = d.get("after"),
        )
        r.ts = d.get("ts", "")
        return r

    def __repr__(self):
        return (f"WALRecord(lsn={self.lsn}, txn={self.txn_id}, "
                f"op={self.op}, table={self.table}, key={self.key})")


class WALManager:
    """
    Thread-safe WAL manager.

    Parameters
    ----------
    log_path : str  – path to the .log file (created if absent)
    """

    def __init__(self, log_path: str = "data/wal.log"):
        self._path   = log_path
        self._lock   = threading.Lock()
        self._lsn    = 0          # monotonically increasing log sequence number

        # Create parent directory if needed
        os.makedirs(os.path.dirname(os.path.abspath(log_path)), exist_ok=True)

        # Load existing LSN high-water mark
        self._lsn = self._max_lsn_on_disk()

    # ------------------------------------------------------------------
    # Writing
    # ------------------------------------------------------------------

    def append(
        self,
        txn_id: str,
        op: str,
        table: str | None = None,
        key: Any = None,
        before: Any = None,
        after: Any = None,
    ) -> WALRecord:
        """Append one record to the WAL file. Returns the WALRecord."""
        with self._lock:
            self._lsn += 1
            rec = WALRecord(self._lsn, txn_id, op, table, key, before, after)
            line = json.dumps(rec.to_dict()) + "\n"
            with open(self._path, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                os.fsync(f.fileno())   # durability guarantee
            return rec

    # ------------------------------------------------------------------
    # Reading / recovery
    # ------------------------------------------------------------------

    def read_all(self) -> list[WALRecord]:
        """Read every record from the WAL file in LSN order."""
        records: list[WALRecord] = []
        if not os.path.exists(self._path):
            return records
        with open(self._path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(WALRecord.from_dict(json.loads(line)))
                except json.JSONDecodeError:
                    pass   # skip corrupted tail bytes
        records.sort(key=lambda r: r.lsn)
        return records

    def transactions_in_log(self) -> dict[str, str]:
        """
        Return a mapping  txn_id → final_status  ("COMMITTED" | "ABORTED" | "ACTIVE")
        by scanning the WAL.
        """
        status: dict[str, str] = {}
        for rec in self.read_all():
            if rec.op == OP_BEGIN:
                status[rec.txn_id] = "ACTIVE"
            elif rec.op == OP_COMMIT:
                status[rec.txn_id] = "COMMITTED"
            elif rec.op == OP_ABORT:
                status[rec.txn_id] = "ABORTED"
        return status

    def records_for_txn(self, txn_id: str) -> list[WALRecord]:
        """Return all WAL records belonging to *txn_id*, in LSN order."""
        return [r for r in self.read_all() if r.txn_id == txn_id]

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def truncate(self) -> None:
        """Erase the WAL file (call after a full checkpoint)."""
        with self._lock:
            open(self._path, "w").close()
            self._lsn = 0

    def _max_lsn_on_disk(self) -> int:
        records = self.read_all()
        return records[-1].lsn if records else 0

    # ------------------------------------------------------------------
    # Repr
    # ------------------------------------------------------------------

    def __repr__(self):
        return f"WALManager(path={self._path!r}, lsn={self._lsn})"
