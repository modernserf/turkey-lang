interface MyMap<Key, Value> {
  get size(): number;
  has(key: Key): boolean;
  get(key: Key): Value | undefined;
  set(key: Key, value: Value): this;
  delete(key: Key): boolean;
  clear(): this;
  [Symbol.iterator](): IterableIterator<[Key, Value]>;
}

type BackingStoreEntry<Key, Value> =
  | null
  | { tag: "entry"; key: Key; value: Value }
  | { tag: "tombstone" };

type HashFunc<Key> = (key: Key, magnitude: number) => number;

export class HashMap<Key, Value> implements MyMap<Key, Value> {
  private backingStore!: BackingStoreEntry<Key, Value>[];
  // 2 ** magnitude == size of backing store
  // magnitude == bits of entropy needed for hashing
  private magnitude: number;
  private hash: HashFunc<Key>;
  private _size!: number;
  private load!: number;
  constructor(hash: HashFunc<Key>) {
    this.hash = hash;
    this.magnitude = 5;
    this.initStore();
  }
  get size() {
    return this._size;
  }
  has(key: Key): boolean {
    const entry = this.backingStore[this.find(key, false)];
    return entry?.tag === "entry";
  }
  get(key: Key): Value | undefined {
    const entry = this.backingStore[this.find(key, false)];
    if (entry?.tag === "entry") return entry.value;
    return undefined;
  }
  set(key: Key, value: Value): this {
    this.resizeProactively();
    const index = this.find(key, true);
    const entry = this.backingStore[index];
    if (entry === null) {
      this.load += 1;
    }
    if (entry === null || entry.tag === "tombstone") {
      this._size += 1;
    }
    this.backingStore[index] = { tag: "entry", key, value };
    return this;
  }
  delete(key: Key): boolean {
    const index = this.find(key, false);
    const entry = this.backingStore[index];
    if (entry === null) return false;

    this._size -= 1;
    this.backingStore[index] = { tag: "tombstone" };
    return true;
  }
  clear(): this {
    this.initStore();
    return this;
  }
  *[Symbol.iterator](): IterableIterator<[Key, Value]> {
    for (const entry of this.backingStore) {
      if (entry?.tag === "entry") {
        yield [entry.key, entry.value];
      }
    }
  }
  private find(key: Key, stopAtTombstone: boolean): number {
    const hash = this.hash(key, this.magnitude);
    const mask = this.capacity - 1;
    for (let i = 0; i < this.capacity; i++) {
      const index = (hash + i) & mask;
      const entry = this.backingStore[index];
      if (entry === null) return index;
      if (entry.tag === "tombstone" && stopAtTombstone) return index;
      if (entry.tag === "entry" && entry.key === key) return index;
    }

    this.resize();
    return this.find(key, stopAtTombstone);
  }
  private resizeProactively(): void {
    // 75% capacity -> (2^n) * (3/4) -> 2^n-1 + 2^n-2
    const maxLoad = (1 << (this.magnitude - 1)) + (1 << (this.magnitude - 2));
    if (this.load > maxLoad) {
      this.resize();
    }
  }
  private resize(): void {
    const oldStore = this.backingStore;
    this.magnitude += 1;
    this.initStore();
    for (const entry of oldStore) {
      if (entry && entry.tag === "entry") {
        this.set(entry.key, entry.value);
      }
    }
  }
  private initStore(): void {
    this._size = 0;
    this.load = 0;
    this.backingStore = Array(this.capacity).fill(null);
  }
  private get capacity(): number {
    return 1 << this.magnitude;
  }
}

enum Cmp {
  LT = -1,
  EQ = 0,
  GT = 1,
}

type CompareFn<Key> = (a: Key, b: Key) => Cmp;

type Tree<Key, Value> = {
  key: Key;
  value: Value;
  left: Tree<Key, Value>;
  right: Tree<Key, Value>;
  height: number;
} | null;

export class OrdMap<Key, Value> implements MyMap<Key, Value> {
  private tree: Tree<Key, Value>;
  private cmp: CompareFn<Key>;
  private _size: number;
  constructor(cmp: CompareFn<Key>) {
    this.cmp = cmp;
    this.tree = null;
    this._size = 0;
  }
  clear() {
    this.tree = null;
    this._size = 0;
    return this;
  }
  has(key: Key) {
    let tree = this.tree;
    while (tree) {
      switch (this.cmp(key, tree.key)) {
        case Cmp.EQ:
          return true;
        case Cmp.LT:
          tree = tree.left;
          break;
        case Cmp.GT:
          tree = tree.right;
          break;
      }
    }
    return false;
  }
  get(key: Key) {
    let tree = this.tree;
    while (tree) {
      switch (this.cmp(key, tree.key)) {
        case Cmp.EQ:
          return tree.value;
        case Cmp.LT:
          tree = tree.left;
          break;
        case Cmp.GT:
          tree = tree.right;
          break;
      }
    }
    return undefined;
  }
  set(key: Key, value: Value) {
    const entry = { key, value, left: null, right: null, height: 1 };
    if (!this.tree) {
      this.tree = entry;
      this._size += 1;
      return this;
    }
    const parents: Tree<Key, Value>[] = [];
    let parent = this.tree;
    while (true) {
      parents.push(parent);
      switch (this.cmp(key, parent.key)) {
        case Cmp.EQ:
          parent.value = value;
          return this;
        case Cmp.LT:
          if (parent.left) {
            parent = parent.left;
            break;
          }
          parent.left = entry;
          updateHeight(parent.right);
          return this.afterInsert(parents);
        case Cmp.GT:
          if (parent.right) {
            parent = parent.right;
            break;
          }
          parent.right = entry;
          updateHeight(parent.right);
          return this.afterInsert(parents);
      }
    }
  }
  private afterInsert(parents: Tree<Key, Value>[]): this {
    while (parents.length) {
      const node = parents.pop();
      if (!node) continue;
      node.left = this.rebalance(node.left);
      node.right = this.rebalance(node.right);
    }
    this.tree = this.rebalance(this.tree);

    return this;
  }
  private rebalance(node: Tree<Key, Value>): Tree<Key, Value> {
    if (!node) return null;
    const lh = node.left?.height ?? 0;
    const rh = node.right?.height ?? 0;
    if (node.left && lh > rh + 1) {
      if (node.left.right) {
        /*   10             8
          (6)   12       6     10
         5  8           5 x  y   12
           x y
        */
        const newRoot = node.left.right;
        const xNode = newRoot.left;
        const yNode = newRoot.right;
        newRoot.left = node.left;
        newRoot.right = node;
        newRoot.left.right = xNode;
        newRoot.right.left = yNode;
        updateHeight(newRoot.left);
        updateHeight(newRoot.right);
        updateHeight(newRoot);
        return newRoot;
      } else {
        /*   10         8
          (8)   12    6   10
         6           x x    12
        x x
        */
        node.left.right = node.right;
        updateHeight(node.left);
        updateHeight(node);
        return node.left;
      }
    } else if (node.right && rh > lh + 1) {
      if (node.right.left) {
        /*    10                      12
          5       (15)    ->      10      15
                12    17         5  x   y  17
              x  y
        */
        const newRoot = node.right.left;
        const xNode = newRoot.left;
        const yNode = newRoot.right;
        newRoot.left = node;
        newRoot.right = node.right;
        newRoot.left.right = xNode;
        newRoot.right.left = yNode;
        updateHeight(newRoot.left);
        updateHeight(newRoot.right);
        updateHeight(newRoot);
        return newRoot;
      } else {
        /*    10                 15
            5    (15)    ->   10    17
                    17      5      x  x
                  x  x
        */
        node.right.left = node.left;
        updateHeight(node.right);
        updateHeight(node);
        return node.right;
      }
    } else {
      return node;
    }
  }
  delete(key: Key): boolean {
    if (!this.tree) return false;
    let parent = this.tree;
    while (true) {
      switch (this.cmp(key, parent.key)) {
        case Cmp.EQ:
          this.tree = this.splice(parent.left, parent.right);
          // TODO: rebalance
          this._size -= 1;
          return true;
        case Cmp.LT:
          if (parent.left) {
            parent = parent.left;
            break;
          } else {
            return false;
          }
        case Cmp.GT:
          if (parent.right) {
            parent = parent.right;
            break;
          } else {
            return false;
          }
      }
    }
  }
  get size() {
    return this._size;
  }
  splice(left: Tree<Key, Value>, right: Tree<Key, Value>): Tree<Key, Value> {
    if (!left) return right;
    let parent = left;
    while (parent.right) {
      parent = parent.right;
    }
    parent.right = right;
    return left;
  }
  *[Symbol.iterator](): IterableIterator<[Key, Value]> {
    const stack = [this.tree];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node.left) {
        stack.push({ ...node, left: null });
        stack.push(node.left);
      } else {
        stack.push(node.right);
        yield [node.key, node.value];
      }
    }
  }
}

function updateHeight(tree: Tree<unknown, unknown>): void {
  if (!tree) return;
  tree.height = 1 + Math.max(tree.left?.height ?? 0, tree.right?.height ?? 0);
}
