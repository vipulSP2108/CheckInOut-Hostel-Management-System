"""
test_acid.py  –  ACID Validation Test Suite for Module A, Assignment 3
=======================================================================

Tests
-----
T01  Atomicity – successful commit applies ALL ops
T02  Atomicity – rollback applies ZERO ops
T03  Atomicity – simulated mid-transaction crash leaves DB clean
T04  Consistency – primary-key constraint holds across transactions
T05  Consistency – DB+B+Tree always in sync after commit
T06  Consistency – DB+B+Tree always in sync after rollback
T07  Isolation  – dirty read prevention
T08  Isolation  – two concurrent txns do not see each other's pending writes
T09  Durability – WAL contains COMMIT before function returns
T10  Durability – recovery rebuilds committed state from WAL
T11  Durability – recovery ignores aborted (loser) transactions
T12  Crash Recovery – simulated crash mid-txn, recovery restores last good state
T13  Cascade rollback on exception during apply
T14  Concurrent transactions on different tables (no interference)
T15  Stress – 200 sequential committed inserts; count and values correct
"""

import os
import sys
import shutil
import threading
import time
import traceback
import unittest

# Ensure imports resolve from the Module_A root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database.bplustree import BPlusTree
from database.table import Table
from database.db_manager import DatabaseManager
from database.wal import WALManager
from database.transaction_manager import TransactionManager, TxnState
from database.recovery import RecoveryManager


# ── helpers ──────────────────────────────────────────────────────────────────
WAL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "test_wal")


def fresh_db(db_name: str = "test_db") -> DatabaseManager:
    """Create a clean DatabaseManager with a students table."""
    db = DatabaseManager(db_name)
    db.create_table(
        "students",
        columns=["id", "name", "gpa", "dept"],
        pk_column="id",
        order=4,
    )
    return db


def fresh_tm(db: DatabaseManager, suffix: str = "") -> TransactionManager:
    """Create a TransactionManager with an isolated WAL file."""
    wal_path = os.path.join(WAL_DIR, f"wal_{suffix}.log")
    os.makedirs(WAL_DIR, exist_ok=True)
    if os.path.exists(wal_path):
        os.remove(wal_path)
    return TransactionManager(db, wal_path=wal_path)


def make_student(sid: int) -> dict:
    return {"id": sid, "name": f"Student_{sid}", "gpa": round(7.0 + (sid % 30) * 0.1, 1), "dept": "CS"}


# ── Test class ────────────────────────────────────────────────────────────────
class TestACID(unittest.TestCase):

    # =========================================================================
    # T01  Atomicity – commit applies ALL buffered ops
    # =========================================================================
    def test_T01_atomicity_commit_applies_all(self):
        db = fresh_db("T01")
        tm = fresh_tm(db, "T01")
        t = tm.begin()
        tm.insert(t, "students", make_student(1))
        tm.insert(t, "students", make_student(2))
        tm.insert(t, "students", make_student(3))

        # Before commit: DB should be untouched
        self.assertIsNone(db.select("students", 1), "dirty read before commit")

        tm.commit(t)

        # After commit: all three rows must exist
        self.assertIsNotNone(db.select("students", 1))
        self.assertIsNotNone(db.select("students", 2))
        self.assertIsNotNone(db.select("students", 3))
        self.assertEqual(db.count("students"), 3)

    # =========================================================================
    # T02  Atomicity – rollback applies ZERO ops
    # =========================================================================
    def test_T02_atomicity_rollback_applies_none(self):
        db = fresh_db("T02")
        tm = fresh_tm(db, "T02")
        t = tm.begin()
        tm.insert(t, "students", make_student(10))
        tm.insert(t, "students", make_student(11))

        tm.rollback(t)

        self.assertEqual(db.count("students"), 0)
        self.assertIsNone(db.select("students", 10))
        self.assertIsNone(db.select("students", 11))

    # =========================================================================
    # T03  Atomicity – exception during commit triggers auto-rollback
    # =========================================================================
    def test_T03_atomicity_exception_during_commit(self):
        db = fresh_db("T03")
        tm = fresh_tm(db, "T03")

        # Pre-insert row 5 so a second insert of 5 causes PK conflict
        t_pre = tm.begin()
        tm.insert(t_pre, "students", make_student(5))
        tm.commit(t_pre)

        # New txn tries to insert 5 again (should raise on buffer step)
        t = tm.begin()
        with self.assertRaises(ValueError):
            tm.insert(t, "students", make_student(5))   # duplicate PK
        tm.rollback(t)

        # DB should still have exactly 1 row
        self.assertEqual(db.count("students"), 1)

    # =========================================================================
    # T04  Consistency – PK uniqueness enforced
    # =========================================================================
    def test_T04_consistency_pk_uniqueness(self):
        db = fresh_db("T04")
        tm = fresh_tm(db, "T04")

        t1 = tm.begin()
        tm.insert(t1, "students", make_student(99))
        tm.commit(t1)

        t2 = tm.begin()
        with self.assertRaises(ValueError):
            tm.insert(t2, "students", make_student(99))
        tm.rollback(t2)

        self.assertEqual(db.count("students"), 1)

    # =========================================================================
    # T05  Consistency – DB and B+ Tree in sync after commit
    # =========================================================================
    def test_T05_consistency_db_bptree_sync_after_commit(self):
        db = fresh_db("T05")
        tm = fresh_tm(db, "T05")
        t = tm.begin()
        for i in range(1, 6):
            tm.insert(t, "students", make_student(i))
        tm.commit(t)

        tbl = db.get_table("students")
        db_rows = db.select_all("students")
        # B+ Tree get_all should match exactly
        tree_rows = [v for _, v in tbl._index.get_all()]
        self.assertEqual(len(db_rows), len(tree_rows))
        for db_r, tree_r in zip(db_rows, tree_rows):
            self.assertEqual(db_r["id"], tree_r["id"])

    # =========================================================================
    # T06  Consistency – DB and B+ Tree in sync after rollback
    # =========================================================================
    def test_T06_consistency_db_bptree_sync_after_rollback(self):
        db = fresh_db("T06")
        tm = fresh_tm(db, "T06")

        # Commit some baseline rows
        t0 = tm.begin()
        for i in range(1, 4):
            tm.insert(t0, "students", make_student(i))
        tm.commit(t0)

        # Now rollback a subsequent txn
        t1 = tm.begin()
        tm.insert(t1, "students", make_student(100))
        tm.rollback(t1)

        tbl = db.get_table("students")
        db_rows = db.select_all("students")
        tree_rows = [v for _, v in tbl._index.get_all()]
        self.assertEqual(len(db_rows), 3)
        self.assertEqual(len(tree_rows), 3)
        # row 100 must not appear anywhere
        self.assertNotIn(100, [r["id"] for r in db_rows])
        self.assertNotIn(100, [r["id"] for r in tree_rows])

    # =========================================================================
    # T07  Isolation – dirty read prevention
    # =========================================================================
    def test_T07_isolation_no_dirty_read(self):
        db = fresh_db("T07")
        tm = fresh_tm(db, "T07")

        # T_A inserts but does NOT commit yet
        t_a = tm.begin()
        tm.insert(t_a, "students", make_student(42))

        # T_B starts and tries to read row 42 from committed state
        t_b = tm.begin()
        row = tm.select(t_b, "students", 42)
        self.assertIsNone(row, "dirty read: T_B should not see T_A's uncommitted insert")

        tm.commit(t_a)
        tm.rollback(t_b)

    # =========================================================================
    # T08  Isolation – concurrent txns see each other only after commit
    # =========================================================================
    def test_T08_isolation_concurrent_txns(self):
        db = fresh_db("T08")
        tm = fresh_tm(db, "T08")

        t_a = tm.begin()
        t_b = tm.begin()

        tm.insert(t_a, "students", make_student(1))
        tm.insert(t_b, "students", make_student(2))

        # Neither has committed yet – each should not see the other's writes
        self.assertIsNone(tm.select(t_b, "students", 1), "T_B sees T_A's uncommitted row")
        self.assertIsNone(tm.select(t_a, "students", 2), "T_A sees T_B's uncommitted row")

        tm.commit(t_a)
        # Now T_B should see T_A's committed row (read-committed)
        self.assertIsNotNone(db.select("students", 1))

        tm.commit(t_b)
        self.assertIsNotNone(db.select("students", 2))

    # =========================================================================
    # T09  Durability – WAL COMMIT record exists before commit returns
    # =========================================================================
    def test_T09_durability_commit_record_in_wal(self):
        db = fresh_db("T09")
        tm = fresh_tm(db, "T09")
        t = tm.begin()
        tm.insert(t, "students", make_student(7))
        tm.commit(t)

        # Read raw WAL
        records = tm.wal.read_all()
        commit_records = [r for r in records if r.op == "COMMIT" and r.txn_id == t]
        self.assertEqual(len(commit_records), 1, "COMMIT record missing from WAL")

    # =========================================================================
    # T10  Durability – recovery rebuilds committed state
    # =========================================================================
    def test_T10_durability_recovery_rebuilds_committed(self):
        wal_path = os.path.join(WAL_DIR, "wal_T10.log")
        if os.path.exists(wal_path):
            os.remove(wal_path)

        # Session 1: insert and commit
        db1 = fresh_db("T10_s1")
        tm1 = TransactionManager(db1, wal_path=wal_path)
        t = tm1.begin()
        for i in range(1, 4):
            tm1.insert(t, "students", make_student(i))
        tm1.commit(t)
        del tm1, db1   # "shutdown"

        # Session 2: fresh empty DB, run recovery
        db2 = fresh_db("T10_s2")
        rm = RecoveryManager(db2, wal_path=wal_path)
        report = rm.recover()

        self.assertEqual(len(report.loser_txns), 0)
        self.assertEqual(db2.count("students"), 3)
        for i in range(1, 4):
            self.assertIsNotNone(db2.select("students", i))

    # =========================================================================
    # T11  Durability – recovery ignores ABORT/loser transactions
    # =========================================================================
    def test_T11_durability_recovery_ignores_loser(self):
        wal_path = os.path.join(WAL_DIR, "wal_T11.log")
        if os.path.exists(wal_path):
            os.remove(wal_path)

        db1 = fresh_db("T11_s1")
        tm1 = TransactionManager(db1, wal_path=wal_path)

        # Committed txn
        t_ok = tm1.begin()
        tm1.insert(t_ok, "students", make_student(1))
        tm1.commit(t_ok)

        # Rolled-back txn
        t_bad = tm1.begin()
        tm1.insert(t_bad, "students", make_student(999))
        tm1.rollback(t_bad)
        del tm1, db1

        # Recovery
        db2 = fresh_db("T11_s2")
        rm = RecoveryManager(db2, wal_path=wal_path)
        report = rm.recover()

        self.assertEqual(db2.count("students"), 1)
        self.assertIsNotNone(db2.select("students", 1))
        self.assertIsNone(db2.select("students", 999))

    # =========================================================================
    # T12  Crash Recovery – simulated crash mid-transaction
    # =========================================================================
    def test_T12_crash_recovery_mid_txn(self):
        wal_path = os.path.join(WAL_DIR, "wal_T12.log")
        if os.path.exists(wal_path):
            os.remove(wal_path)

        # Phase A: commit one txn, then simulate a crash mid-second-txn
        db1 = fresh_db("T12_s1")
        wal1 = WALManager(log_path=wal_path)
        tm1  = TransactionManager(db1, wal_path=wal_path)

        # T_committed
        tc = tm1.begin()
        tm1.insert(tc, "students", make_student(10))
        tm1.commit(tc)

        # T_crashed: write BEGIN + INSERT to WAL but never COMMIT
        t_crash = f"T-CRASH"
        wal1.append(t_crash, "BEGIN")
        wal1.append(t_crash, "INSERT", "students", 20,
                    before=None, after=make_student(20))
        # ↑ No COMMIT written – simulates crash here

        del tm1, db1, wal1   # "power off"

        # Phase B: new session, run recovery
        db2 = fresh_db("T12_s2")
        rm = RecoveryManager(db2, wal_path=wal_path)
        report = rm.recover()

        self.assertIn("T-CRASH", report.loser_txns)
        self.assertEqual(db2.count("students"), 1)
        self.assertIsNotNone(db2.select("students", 10), "committed row missing after recovery")
        self.assertIsNone(db2.select("students", 20), "crashed row present after recovery")

    # =========================================================================
    # T13  Cascade rollback on apply exception
    # =========================================================================
    def test_T13_cascade_rollback_on_apply_error(self):
        db = fresh_db("T13")
        tm = fresh_tm(db, "T13")

        # Pre-insert row 55
        t_pre = tm.begin()
        tm.insert(t_pre, "students", make_student(55))
        tm.commit(t_pre)

        # New txn: valid insert + duplicate insert (will fail at buffer stage)
        t = tm.begin()
        tm.insert(t, "students", make_student(60))
        with self.assertRaises(ValueError):
            tm.insert(t, "students", make_student(55))  # PK conflict at buffer
        tm.rollback(t)

        # Only row 55 (and nothing else) must exist
        self.assertEqual(db.count("students"), 1)
        self.assertIsNone(db.select("students", 60))

    # =========================================================================
    # T14  Concurrent transactions on different tables (no interference)
    # =========================================================================
    def test_T14_concurrent_different_tables(self):
        db = DatabaseManager("T14_db")
        db.create_table("courses", ["cid","title","credits"], pk_column="cid", order=4)
        db.create_table("students", ["id","name","gpa","dept"], pk_column="id", order=4)

        wal_path = os.path.join(WAL_DIR, "wal_T14.log")
        if os.path.exists(wal_path): os.remove(wal_path)
        tm = TransactionManager(db, wal_path=wal_path)

        results = {}
        errors  = []

        def insert_students():
            try:
                t = tm.begin()
                for i in range(1, 6):
                    tm.insert(t, "students", make_student(i))
                tm.commit(t)
                results["students"] = db.count("students")
            except Exception as e:
                errors.append(("students", str(e)))

        def insert_courses():
            try:
                t = tm.begin()
                for c in range(1, 4):
                    tm.insert(t, "courses", {"cid": c, "title": f"CS-{c*100}", "credits": 3})
                tm.commit(t)
                results["courses"] = db.count("courses")
            except Exception as e:
                errors.append(("courses", str(e)))

        th1 = threading.Thread(target=insert_students)
        th2 = threading.Thread(target=insert_courses)
        th1.start(); th2.start()
        th1.join();  th2.join()

        self.assertEqual(errors, [], f"Errors in concurrent threads: {errors}")
        self.assertEqual(results.get("students"), 5)
        self.assertEqual(results.get("courses"), 3)

    # =========================================================================
    # T15  Stress – 200 sequential committed inserts
    # =========================================================================
    def test_T15_stress_200_sequential_inserts(self):
        db = fresh_db("T15")
        wal_path = os.path.join(WAL_DIR, "wal_T15.log")
        if os.path.exists(wal_path): os.remove(wal_path)
        tm = TransactionManager(db, wal_path=wal_path)

        BATCH = 50   # 4 batches of 50 = 200
        total = 0
        for batch_start in range(0, 200, BATCH):
            t = tm.begin()
            for i in range(batch_start, batch_start + BATCH):
                tm.insert(t, "students", make_student(i))
            tm.commit(t)
            total += BATCH

        self.assertEqual(db.count("students"), 200)
        # Spot-check a few values
        for pk in [0, 50, 100, 150, 199]:
            row = db.select("students", pk)
            self.assertIsNotNone(row, f"Row {pk} missing")
            self.assertEqual(row["id"], pk) # type: ignore

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Clean up old WAL files before running
    if os.path.exists(WAL_DIR):
        shutil.rmtree(WAL_DIR)
    os.makedirs(WAL_DIR, exist_ok=True)

    loader = unittest.TestLoader()
    suite  = loader.loadTestsFromTestCase(TestACID)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
