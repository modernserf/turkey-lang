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

export class Scope<K, V> {
  private map: Map<K, V> = new Map();
  constructor(private parent: Scope<K, V> | null = null) {}
  has(key: K): boolean {
    if (this.map.has(key)) return true;
    if (this.parent) return this.parent.has(key);
    return false;
  }
  get(key: K): V {
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
    if (this === parentScope) {
      if (this.has(key)) return true;
      throw new KeyNotFoundError(key);
    }
    if (!this.parent) throw new Error("parent scope not in scope chain");
    if (this.map.has(key)) return false;
    return this.parent.isUpvalue(key, parentScope);
  }
}
