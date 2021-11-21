import { Scope } from "./scope";
import { Type, ValueType, Trait } from "./types";

export class TypeMismatchError extends Error {
  constructor(public left: Type, public right: Type) {
    super(`Type mismatch`);
  }
}

export class TypeChecker {
  private scope: Scope<symbol, Type> = new Scope();
  static createVar(name: symbol, traits: Trait[]): Type {
    return { tag: "var", name, traits };
  }
  static createTrait(name: symbol, parameters: Type[]): Trait {
    return { tag: "trait", name, parameters };
  }
  static createValue(
    name: symbol,
    matchTypes: Type[],
    allTypes: Type[],
    traits: Trait[]
  ): ValueType {
    return { tag: "value", name, matchTypes, allTypes, traits };
  }
  createRec(traits: Trait[], fn: (value: Type, traits: Trait[]) => Type): Type {
    return this.inScope(() => {
      const rec = TypeChecker.createVar(Symbol("rec"), traits);
      this.unify(rec, fn(rec, traits));
      return this.resolve(rec);
    });
  }
  getField(
    target: Type,
    type: symbol,
    index: number,
    fieldType: Type,
    error: string
  ): Type {
    return this.inScope(() => {
      target = this.checkValueType(target, type, error);
      this.unify(target.allTypes[index], fieldType);
      return this.resolve(fieldType);
    });
  }
  getAllMatchTypes(
    target: Type,
    type: symbol,
    fields: Type[],
    error: string
  ): Type[] {
    return this.inScope(() => {
      target = this.checkValueType(target, type, error);
      this.unifyList(target.matchTypes, fields);
      return fields.map((type) => this.resolve(type));
    });
  }
  checkValueType(type: Type, typeName: symbol, error: string): ValueType {
    type = this.deref(type);
    if (type.tag === "var" || type.name !== typeName) {
      throw new Error(error);
    }
    return type;
  }
  inScope<T>(fn: () => T): T {
    this.scope = this.scope.push();
    try {
      return fn();
    } finally {
      this.scope = this.scope.pop();
    }
  }
  unifyList(left: Type[], right: Type[]): void {
    for (let i = 0; i < left.length; i++) {
      this.unify(left[i], right[i]);
    }
  }
  unify(left: Type, right: Type): void {
    left = this.deref(left);
    right = this.deref(right);
    if (left.tag === "var") {
      this.unifyTraits(left.traits, right.traits);
      this.scope.init(left.name, right);
      return;
    }
    if (right.tag === "var") {
      this.unifyTraits(right.traits, left.traits);
      this.scope.init(right.name, left);
      return;
    }
    if (left.name !== right.name) throw new TypeMismatchError(left, right);
    for (const [i, type] of left.matchTypes.entries()) {
      this.unify(type, right.matchTypes[i]);
    }
  }
  // concrete traits may be a superset of var traits
  private unifyTraits(varTraits: Trait[], concreteTraits: Trait[]): void {
    for (const l of varTraits) {
      if (!concreteTraits.find((r) => r.name === l.name)) {
        throw new Error("trait mismatch");
      }
    }
  }
  resolve(type: Type, visited = new Map<Type, Type>()): Type {
    type = this.deref(type);
    if (type.tag === "var") return type;
    const prev = visited.get(type);
    if (prev) return prev;
    const nextType: Type = {
      tag: "value",
      name: type.name,
      matchTypes: [],
      allTypes: [],
      traits: type.traits,
    };
    visited.set(type, nextType);
    for (const t of type.matchTypes) {
      nextType.matchTypes.push(this.resolve(t, visited));
    }
    for (const t of type.allTypes) {
      nextType.allTypes.push(this.resolve(t, visited));
    }

    return nextType;
  }
  private deref(type: Type): Type {
    const visited = new Set<Type>();
    while (type.tag === "var") {
      // istanbul ignore next
      if (visited.has(type)) throw new Error("loop in type definition");
      visited.add(type);
      if (!this.scope.has(type.name)) break;
      type = this.scope.get(type.name);
    }
    return type;
  }
}
