"""
db_manager.py  :  Database Manager 

Manages a collection of named Table objects (one "database" per manager
instance) and exposes a simple API that resembles a lightweight SQL engine.
"""

from __future__ import annotations
from typing import Any
from .table import Table


class DatabaseManager:
    """
    Manages multiple Table instances under a single named database.

    Usage example
    -------------
    db = DatabaseManager("students_db")
    db.create_table("students", ["id", "name", "gpa"], pk_column="id")
    db.insert("students", {"id": 1, "name": "Alice", "gpa": 9.1})
    row = db.select("students", pk_value=1)
    db.update("students", pk_value=1, updates={"gpa": 9.5})
    db.delete("students", pk_value=1)
    """

    def __init__(self, name: str = "default_db"):
        self.name = name
        self._tables: dict[str, Table] = {}

    # ------------------------------------------------------------------
    # Schema management
    # ------------------------------------------------------------------

    def create_table(
        self,
        table_name: str,
        columns: list[str],
        pk_column: str,
        order: int = 4,
    ) -> Table:
        """Create and register a new table. Raises if it already exists."""
        if table_name in self._tables:
            raise ValueError(f"Table '{table_name}' already exists in '{self.name}'")
        tbl = Table(table_name, columns, pk_column, order=order)
        self._tables[table_name] = tbl
        return tbl

    def drop_table(self, table_name: str) -> bool:
        """Remove a table and all its data. Returns True on success."""
        if table_name not in self._tables:
            return False
        del self._tables[table_name]
        return True

    def get_table(self, table_name: str) -> Table:
        """Return the Table object; raise KeyError if not found."""
        if table_name not in self._tables:
            raise KeyError(f"Table '{table_name}' does not exist in '{self.name}'")
        return self._tables[table_name]

    def list_tables(self) -> list[str]:
        return list(self._tables.keys())

    # ------------------------------------------------------------------
    # DML helpers (thin wrappers around Table methods)
    # ------------------------------------------------------------------

    def insert(self, table_name: str, row: dict[str, Any]) -> None:
        self.get_table(table_name).insert_row(row)

    def select(self, table_name: str, pk_value) -> dict[str, Any] | None:
        return self.get_table(table_name).select(pk_value)

    def select_all(self, table_name: str) -> list[dict[str, Any]]:
        return self.get_table(table_name).select_all()

    def range_select(
        self, table_name: str, start_pk, end_pk
    ) -> list[dict[str, Any]]:
        return self.get_table(table_name).range_select(start_pk, end_pk)

    def update(
        self, table_name: str, pk_value, updates: dict[str, Any]
    ) -> bool:
        return self.get_table(table_name).update_row(pk_value, updates)

    def delete(self, table_name: str, pk_value) -> bool:
        return self.get_table(table_name).delete_row(pk_value)

    # ------------------------------------------------------------------
    # Aggregate pass-throughs
    # ------------------------------------------------------------------

    def count(self, table_name: str) -> int:
        return self.get_table(table_name).count()

    def min_val(self, table_name: str, column: str):
        return self.get_table(table_name).min_val(column)

    def max_val(self, table_name: str, column: str):
        return self.get_table(table_name).max_val(column)

    def sum_val(self, table_name: str, column: str):
        return self.get_table(table_name).sum_val(column)

    def avg_val(self, table_name: str, column: str):
        return self.get_table(table_name).avg_val(column)

    # ------------------------------------------------------------------
    # Visualisation
    # ------------------------------------------------------------------

    def visualize_table(self, table_name: str):
        """Return a Graphviz Digraph for the named table."""
        return self.get_table(table_name).visualize()

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __repr__(self):
        tbls = ", ".join(self.list_tables()) or "(empty)"
        return f"DatabaseManager(name={self.name!r}, tables=[{tbls}])"
