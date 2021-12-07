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

export class StrictMap<K, V> {
  private map: Map<K, V> = new Map();
  constructor(init: Iterable<[K, V]> = []) {
    for (const [key, value] of init) {
      this.init(key, value);
    }
  }
  has(key: K): boolean {
    return this.map.has(key);
  }
  get(key: K): V {
    if (this.map.has(key)) return this.map.get(key) as V;
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
  get size(): number {
    return this.map.size;
  }
  *[Symbol.iterator]() {
    yield* this.map;
  }
  *keys() {
    yield* this.map.keys();
  }
}
