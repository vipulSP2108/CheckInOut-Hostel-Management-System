"""
bplustree.py :  B+ Tree implementation
"""
import graphviz

# ---------------------------------------------------------------------------
# Node
# ---------------------------------------------------------------------------

class BPlusTreeNode:
    """
    A single node in a B+ Tree.

    Leaf nodes   : keys[] ↔ values[] (parallel arrays), next → sibling leaf
    Internal nodes: keys[] are separator keys, children[] are child nodes
    """

    def __init__(self, is_leaf: bool = False):
        self.keys: list = []
        self.values: list = []      # used only in leaf nodes
        self.children: list = []    # used only in internal nodes
        self.is_leaf: bool = is_leaf
        self.next: "BPlusTreeNode | None" = None   # leaf-level linked list


# ---------------------------------------------------------------------------
# B+ Tree
# ---------------------------------------------------------------------------

class BPlusTree:
    """
    B+ Tree with configurable order.

    order  = maximum number of keys per node (i.e. max fanout = order + 1)
    min_keys = ceil(order / 2) - 1   (minimum keys before underflow)
    """

    def __init__(self, order: int = 4):
        if order < 3:
            raise ValueError("B+ Tree order must be at least 3")
        self.order = order                          # max keys per node
        self.min_keys = (order + 1) // 2 - 1       # minimum keys (floor rule)
        self.root = BPlusTreeNode(is_leaf=True)
        self._size = 0                              # total key count

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def __len__(self):
        return self._size

    def _find_leaf(self, key):
        """Traverse from root to the leaf that should contain *key*."""
        node = self.root
        while not node.is_leaf:
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            node = node.children[i]
        return node

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(self, key):
        """
        Search for a key in the B+ tree.
        Return the associated value if found, else None.
        Traverse from root to appropriate leaf node.
        """
        leaf = self._find_leaf(key)
        for i, k in enumerate(leaf.keys):
            if k == key:
                return leaf.values[i]
        return None

    # ------------------------------------------------------------------
    # Insert
    # ------------------------------------------------------------------

    def insert(self, key, value):
        """
        Insert key-value pair into the B+ tree.
        Handle root splitting if necessary.
        Maintain sorted order and balance properties.
        """
        #if already exists
        if self.search(key) is not None:
            #update
            self.update(key, value)
            return
        # If root is full, split it first
        if len(self.root.keys) == self.order:
            old_root = self.root
            new_root = BPlusTreeNode(is_leaf=False)
            new_root.children.append(old_root)
            self._split_child(new_root, 0)
            self.root = new_root

        self._insert_non_full(self.root, key, value)
        self._size += 1

    def _insert_non_full(self, node, key, value):
        """
        Recursive helper to insert into a non-full node.
        Split child nodes if they become full during insertion.
        """
        if node.is_leaf:
            # Binary-insertion into sorted leaf
            i = len(node.keys) - 1
            node.keys.append(None)
            node.values.append(None)
            while i >= 0 and node.keys[i] > key:
                node.keys[i + 1] = node.keys[i]
                node.values[i + 1] = node.values[i]
                i -= 1
            node.keys[i + 1] = key
            node.values[i + 1] = value
        else:
            # Find the correct child
            i = len(node.keys) - 1
            while i >= 0 and node.keys[i] > key:
                i -= 1
            i += 1
            # Split child if full
            if len(node.children[i].keys) == self.order:
                self._split_child(node, i)
                if key >= node.keys[i]:
                    i += 1
            self._insert_non_full(node.children[i], key, value)

    def _split_child(self, parent, index):
        """
        Split the child of *parent* at position *index*.

        For leaves  : preserve linked-list structure and copy the middle key
                      up to the parent (copy-up rule).
        For internal: promote the middle key and split the children
                      (push-up rule).
        """
        child = parent.children[index]
        mid = len(child.keys) // 2
        new_node = BPlusTreeNode(is_leaf=child.is_leaf)

        if child.is_leaf:
            # ── Leaf split (copy-up) ────────────────────────────────────
            new_node.keys = child.keys[mid:]
            new_node.values = child.values[mid:]
            child.keys = child.keys[:mid]
            child.values = child.values[:mid]
            # Maintain linked list
            new_node.next = child.next
            child.next = new_node
            # Copy the first key of the new leaf up to parent
            parent.keys.insert(index, new_node.keys[0])
            parent.children.insert(index + 1, new_node)
        else:
            # ── Internal split (push-up) ────────────────────────────────
            promote_key = child.keys[mid]
            new_node.keys = child.keys[mid + 1:]
            new_node.children = child.children[mid + 1:]
            child.keys = child.keys[:mid]
            child.children = child.children[:mid + 1]
            parent.keys.insert(index, promote_key)
            parent.children.insert(index + 1, new_node)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete(self, key):
        """
        Delete key from the B+ tree.
        Handle underflow by borrowing from siblings or merging nodes.
        Update the root if it becomes empty.
        Return True if deletion succeeded, False otherwise.
        """
        if not self.root.keys:
            return False

        result = self._delete(self.root, key)

        # Shrink tree height if root became empty after a merge
        if not self.root.is_leaf and len(self.root.keys) == 0:
            self.root = self.root.children[0]

        if result:
            self._size -= 1
        return result

    def _delete(self, node, key):
        """
        Recursive helper for deletion. Handles leaf and internal nodes.
        Ensures all nodes maintain minimum keys after deletion.
        """
        if node.is_leaf:
            if key in node.keys:
                idx = node.keys.index(key)
                node.keys.pop(idx)
                node.values.pop(idx)
                return True
            return False

        # Determine which child to descend into
        i = 0
        while i < len(node.keys) and key >= node.keys[i]:
            i += 1

        target_child = node.children[i]

        # Pre-emptively fix underflow before descending
        if len(target_child.keys) < self.min_keys:
            self._fill_child(node, i)
            # Keys in *node* may have changed; re-locate the right child
            i = 0
            while i < len(node.keys) and key >= node.keys[i]:
                i += 1
            target_child = node.children[i]

        result = self._delete(target_child, key)

        # Fix separator key in parent when a leaf key was the separator
        if result and i < len(node.keys) and node.children[i].is_leaf:
            if node.children[i].keys:
                node.keys[i - 1] if i > 0 else None   # separator is to the left
            # Refresh separator: parent.keys[i-1] must equal children[i].keys[0]
            if i > 0 and node.children[i].keys:
                node.keys[i - 1] = node.children[i].keys[0]

        return result

    def _fill_child(self, node, index):
        """
        Ensure child at *index* has enough keys by borrowing from siblings
        or merging with a sibling.
        """
        left_ok = index > 0 and len(node.children[index - 1].keys) > self.min_keys
        right_ok = (index < len(node.children) - 1 and
                    len(node.children[index + 1].keys) > self.min_keys)

        if left_ok:
            self._borrow_from_prev(node, index)
        elif right_ok:
            self._borrow_from_next(node, index)
        else:
            # Merge with a sibling
            if index < len(node.children) - 1:
                self._merge(node, index)          # merge child[index] with child[index+1]
            else:
                self._merge(node, index - 1)      # merge child[index-1] with child[index]

    def _borrow_from_prev(self, node, index):
        """Borrow a key from the left sibling to prevent underflow."""
        child = node.children[index]
        sibling = node.children[index - 1]

        if child.is_leaf:
            # Move last key-value of sibling to front of child
            child.keys.insert(0, sibling.keys[-1])
            child.values.insert(0, sibling.values[-1])
            sibling.keys.pop()
            sibling.values.pop()
            # Update the separator in parent
            node.keys[index - 1] = child.keys[0]
        else:
            # Pull parent separator down into child; push sibling's last key up
            child.keys.insert(0, node.keys[index - 1])
            child.children.insert(0, sibling.children[-1])
            node.keys[index - 1] = sibling.keys[-1]
            sibling.keys.pop()
            sibling.children.pop()

    def _borrow_from_next(self, node, index):
        """Borrow a key from the right sibling to prevent underflow."""
        child = node.children[index]
        sibling = node.children[index + 1]

        if child.is_leaf:
            child.keys.append(sibling.keys[0])
            child.values.append(sibling.values[0])

            sibling.keys.pop(0)
            sibling.values.pop(0)
            # Update the separator in parent

            if sibling.keys:
                node.keys[index] = sibling.keys[0]
            else:
                node.keys.pop(index)
        else:
            child.keys.append(node.keys[index])
            child.children.append(sibling.children[0])
            node.keys[index] = sibling.keys[0]
            sibling.keys.pop(0)
            sibling.children.pop(0)

    def _merge(self, node, index):
        """
        Merge child at *index* with its right sibling (child at index + 1).
        Update parent keys accordingly.
        """
        left = node.children[index]
        right = node.children[index + 1]

        if left.is_leaf:
            # Simply concatenate; maintain linked list
            left.keys.extend(right.keys)
            left.values.extend(right.values)
            left.next = right.next
        else:
            # Pull separator key from parent down into left child
            left.keys.append(node.keys[index])
            left.keys.extend(right.keys)
            left.children.extend(right.children)

        # Remove separator and right child from parent
        node.keys.pop(index)
        node.children.pop(index + 1)

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def update(self, key, new_value):
        """
        Update value associated with an existing key.
        Return True if successful, False if key not found.
        """
        leaf = self._find_leaf(key)
        for i, k in enumerate(leaf.keys):
            if k == key:
                leaf.values[i] = new_value
                return True
        return False

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def range_query(self, start_key, end_key):
        """
        Return all key-value pairs where start_key <= key <= end_key.
        Traverse leaf nodes using the next pointers for efficient range scans.
        """
        results = []
        # Descend to the first leaf that may contain start_key
        node = self.root
        while not node.is_leaf:
            i = 0
            while i < len(node.keys) and start_key >= node.keys[i]:
                i += 1
            node = node.children[i]

        # Scan across linked leaves
        while node is not None:
            for i, k in enumerate(node.keys):
                if k > end_key:
                    return results
                if k >= start_key:
                    results.append((k, node.values[i]))
            node = node.next
        return results

    def get_all(self):
        """
        Return all key-value pairs in the tree in sorted order
        using the leaf-level linked list (in-order traversal).
        """
        results = []
        node = self.root
        while not node.is_leaf:
            node = node.children[0]
        while node is not None:
            for i, k in enumerate(node.keys):
                results.append((k, node.values[i]))
            node = node.next
        return results

    # ------------------------------------------------------------------
    # Visualisation
    # ------------------------------------------------------------------

    def visualize_tree(self):
        """Generate and return a Graphviz Digraph of the B+ tree structure."""
        dot = graphviz.Digraph(
            comment="B+ Tree",
            graph_attr={"rankdir": "TB", "splines": "polyline"},
            node_attr={"fontname": "Helvetica", "fontsize": "11"},
            edge_attr={"arrowsize": "0.7"},
        )
        if self.root.keys or self.root.is_leaf:
            self._add_nodes(dot, self.root)
            self._add_edges(dot, self.root)
        return dot

    def _add_nodes(self, dot, node):
        node_id = str(id(node))

        # --------- LEAF NODE ----------
        if node.is_leaf:
            if len(node.keys) == 0:
                cells = '<TD BGCOLOR="lightblue"><I>empty</I></TD>'
            else:
                cells = "".join(
                    f'<TD BGCOLOR="lightblue"><B>{k}</B></TD>'
                    for k in node.keys
                )

            label = f'''<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="2">
            <TR><TD COLSPAN="{max(len(node.keys),1)}" BGCOLOR="#aed6f1"><I>LEAF</I></TD></TR>
            <TR>{cells}</TR>
            </TABLE>>'''

            dot.node(node_id, label=label, shape="plaintext")

        # --------- INTERNAL NODE ----------
        else:
            if len(node.keys) == 0:
                cells = '<TD BGCOLOR="#fffacd"><I>empty</I></TD>'
            else:
                cells = "".join(
                    f'<TD BGCOLOR="#fffacd"><B>{k}</B></TD>'
                    for k in node.keys
                )

            label = f'''<<TABLE BORDER="1" CELLBORDER="0" CELLSPACING="2">
            <TR><TD COLSPAN="{max(len(node.keys),1)}" BGCOLOR="#f9e79f"><I>INTERNAL</I></TD></TR>
            <TR>{cells}</TR>
            </TABLE>>'''

            dot.node(node_id, label=label, shape="plaintext")

        # Recurse
        for child in node.children:
            self._add_nodes(dot, child)
    
    def _add_edges(self, dot, node):
        """
        Add edges between nodes and dashed lines for leaf connections
        (for visualisation).
        """
        node_id = str(id(node))
        for child in node.children:
            dot.edge(node_id, str(id(child)))
            self._add_edges(dot, child)

        # Dashed edge for leaf linked-list pointer
        if node.is_leaf and node.next is not None:
            dot.edge(
                node_id,
                str(id(node.next)),
                style="dashed",
                color="royalblue",
                constraint="false",
                label="next",
                fontsize="9",
            )
