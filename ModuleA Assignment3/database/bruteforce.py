"""
bruteforce.py : BruteForceDB baseline

Uses a plain Python list with O(n) operations for fair performance comparison
against the B+ Tree.
"""

class BruteForceDB:
    def __init__(self):
        self.data = []

    def insert(self, key):
        if key not in self.data:
            self.data.append(key)

    def search(self, key):
        return key in self.data

    def delete(self, key):
        if key in self.data:
            self.data.remove(key)
            return True
        return False

    def range_query(self, start, end):
        return [k for k in self.data if start <= k <= end]
