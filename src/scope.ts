export class KeyNotFoundError<K> extends Error {
  constructor(public key: K) {
    super(`Key not found: ${String(key)}`);
  }
}

export class DuplicateScopeMemberError<K> extends Error {
  constructor(public key: K) {
    super(`Duplicate Scope Member: ${String(key)}`);
  }
}

export class NoParentScopeError extends Error {
  constructor() {
    super("No parent scope");
  }
}

export class InvalidParentScopeError extends Error {
  constructor() {
    super("parent scope not in scope chain");
  }
}

export class Scope<K, V> {
  private map: Map<K, V> = new Map();
  constructor(private parent: Scope<K, V> | null = null) {}
  has(key: K): boolean {
    if (this.map.has(key)) return true;
    if (this.parent) return this.parent.has(key);
    return false;
  }
  get(key: K): V {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (this.map.has(key)) return this.map.get(key)!;
    if (this.parent) return this.parent.get(key);
    throw new KeyNotFoundError(key);
  }

  init(key: K, value: V): this {
    if (this.map.has(key)) throw new DuplicateScopeMemberError(key);
    this.map.set(key, value);
    return this;
  }
  set(key: K, value: V): this {
    this.map.set(key, value);
    return this;
  }
  push(): Scope<K, V> {
    return new Scope(this);
  }
  pop(): Scope<K, V> {
    if (!this.parent) throw new NoParentScopeError();
    return this.parent;
  }
  get size(): number {
    return this.map.size + (this.parent ? this.parent.size : 0);
  }
  isUpvalue(key: K, parentScope: Scope<K, V>): boolean {
    let found = false;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: Scope<K, V> = this;
    while (current !== parentScope) {
      if (!found && current.map.has(key)) {
        found = true;
      }
      if (!current.parent) throw new InvalidParentScopeError();
      current = current.parent;
    }
    if (found) return false;
    current.get(key);
    return true;
  }
  *[Symbol.iterator](): IterableIterator<[K, V]> {
    if (this.parent) yield* this.parent;
    yield* this.map;
  }
}
