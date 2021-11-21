import { Scope } from "./scope";
import { Type, ValueType, Trait } from "./types";

export class TypeMismatchError extends Error {
  constructor(public left: Type, public right: Type) {
    super(`Type mismatch`);
  }
}

export class TypeChecker {
  private scope: Scope<symbol, Type> = new Scope();
  static createVar(name: string, ...traits: Trait[]): Type {
    return { tag: "var", name: Symbol(name), traits };
  }
  static createTrait(name: string, ...parameters: Type[]): Trait {
    return { tag: "trait", name: Symbol(name), parameters };
  }
  static createValue(
    name: symbol,
    matchTypes: Type[],
    traits: Trait[]
  ): ValueType {
    return { tag: "value", name, matchTypes, traits };
  }
  createRec(traits: Trait[], fn: (value: Type, traits: Trait[]) => Type): Type {
    const rec = TypeChecker.createVar("rec", ...traits);
    this.unify(rec, fn(rec, traits));
    return this.resolve(rec);
  }
  checkValueType(type: Type, typeName: symbol, error: string): ValueType {
    type = this.deref(type);
    if (type.tag === "var" || type.name !== typeName) {
      throw new Error(error);
    }
    return type;
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
      traits: type.traits,
    };
    visited.set(type, nextType);
    for (const t of type.matchTypes) {
      nextType.matchTypes.push(this.resolve(t, visited));
    }

    return nextType;
  }
  private deref(type: Type): Type {
    const visited = new Set<Type>();
    while (type.tag === "var") {
      if (visited.has(type)) {
        // return type;
        throw new Error("loop in type definition");
      }

      visited.add(type);
      if (!this.scope.has(type.name)) break;
      type = this.scope.get(type.name);
    }
    return type;
  }
}
