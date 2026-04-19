"""
table.py : Table abstraction 

Wraps a BPlusTree to give it relational-table semantics:
  - named columns with a designated primary-key column
  - row records stored as dicts
  - CRUD methods that mirror SQL: insert_row, select, update_row, delete_row
  - range_select for range queries
  - aggregate helpers: count, min_val, max_val, sum_val, avg_val
"""

from __future__ import annotations
from typing import Any
from .bplustree import BPlusTree


class Table:
    """
    Lightweight relational-table wrapper around a B+ Tree index.

    Parameters
    ----------
    name       : str   – table name (for display)
    columns    : list  – ordered list of column names
    pk_column  : str   – name of the primary-key column (must be in *columns*)
    order      : int   – B+ Tree order (default 4)
    """

    def __init__(self, name: str, columns: list[str], pk_column: str, order: int = 4):
        if pk_column not in columns:
            raise ValueError(f"pk_column '{pk_column}' must be one of {columns}")
        self.name = name
        self.columns = columns
        self.pk_column = pk_column
        self._index = BPlusTree(order=order)

    # ------------------------------------------------------------------
    # Insert
    # ------------------------------------------------------------------

    def insert_row(self, row: dict[str, Any]) -> None:
        """
        Insert a new row (dict mapping column→value).

        Raises ValueError if the primary key already exists or required columns
        are missing.
        """
        # Validate columns
        missing = [c for c in self.columns if c not in row]
        if missing:
            raise ValueError(f"Missing columns for table '{self.name}': {missing}")

        pk = row[self.pk_column]
        if self._index.search(pk) is not None:
            raise ValueError(
                f"Duplicate primary key '{pk}' in table '{self.name}'"
            )

        # Store a copy so mutations outside don't affect stored data
        self._index.insert(pk, dict(row))

    # ------------------------------------------------------------------
    # Select
    # ------------------------------------------------------------------

    def select(self, pk_value) -> dict[str, Any] | None:
        """Exact-match lookup by primary key. Returns the row dict or None."""
        return self._index.search(pk_value)

    def select_all(self) -> list[dict[str, Any]]:
        """Return every row, sorted by primary key."""
        return [v for _, v in self._index.get_all()]

    def range_select(self, start_pk, end_pk) -> list[dict[str, Any]]:
        """
        Return all rows whose primary key satisfies start_pk <= pk <= end_pk.
        """
        return [v for _, v in self._index.range_query(start_pk, end_pk)]

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def update_row(self, pk_value, updates: dict[str, Any]) -> bool:
        """
        Apply *updates* (partial column→value mapping) to the row with the
        given primary key.  Returns True on success, False if key not found.

        Note: The primary-key column itself cannot be updated this way.
        """
        row = self._index.search(pk_value)
        if row is None:
            return False
        if self.pk_column in updates:
            raise ValueError("Cannot update the primary-key column via update_row.")
        updated = {**row, **updates}
        return self._index.update(pk_value, updated)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_row(self, pk_value) -> bool:
        """Delete the row with *pk_value*. Returns True on success."""
        return self._index.delete(pk_value)

    # ------------------------------------------------------------------
    # Aggregates
    # ------------------------------------------------------------------

    def _column_values(self, column: str) -> list:
        if column not in self.columns:
            raise ValueError(f"Column '{column}' not in table '{self.name}'")
        return [row[column] for row in self.select_all()]

    def count(self) -> int:
        return len(self._index)

    def min_val(self, column: str):
        vals = self._column_values(column)
        return min(vals) if vals else None

    def max_val(self, column: str):
        vals = self._column_values(column)
        return max(vals) if vals else None

    def sum_val(self, column: str):
        vals = self._column_values(column)
        return sum(vals) if vals else None

    def avg_val(self, column: str):
        vals = self._column_values(column)
        return sum(vals) / len(vals) if vals else None

    # ------------------------------------------------------------------
    # Visualisation pass-through
    # ------------------------------------------------------------------

    def visualize(self):
        """Return a Graphviz Digraph of the underlying B+ Tree index."""
        dot = self._index.visualize_tree()
        dot.attr(label=f"Table: {self.name}  (pk={self.pk_column})",
                 labelloc="t", fontsize="14")
        return dot

    # ------------------------------------------------------------------
    # Dunder helpers
    # ------------------------------------------------------------------

    def __repr__(self):
        return (
            f"Table(name={self.name!r}, columns={self.columns}, "
            f"pk={self.pk_column!r}, rows={self.count()})"
        )
