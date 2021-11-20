import { Scope } from "./scope";

export type ValueType = {
  tag: "value";
  name: symbol;
  matchTypes: Type[];
  allTypes: Type[];
};
export type Type = { tag: "var"; name: symbol } | ValueType;

export class TypeMismatchError extends Error {
  constructor(public left: Type, public right: Type) {
    super(`Type mismatch`);
  }
}

export class TypeCheckerInner {
  private scope: Scope<symbol, Type> = new Scope();
  createVar(name: symbol): Type {
    return { tag: "var", name };
  }
  createValue(name: symbol, typeParameters: Type[], fields: Type[]): ValueType {
    return { tag: "value", name, matchTypes: typeParameters, allTypes: fields };
  }
  createRec(fn: (value: Type) => Type): Type {
    return this.inScope(() => {
      const rec = this.createVar(Symbol("rec"));
      this.unify(rec, fn(rec));
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
  getAll(target: Type, type: symbol, fields: Type[], error: string): Type[] {
    return this.inScope(() => {
      target = this.checkValueType(target, type, error);
      this.unifyList(target.matchTypes, fields);
      return fields.map((type) => this.resolve(type));
    });
  }

  private checkValueType(
    type: Type,
    typeName: symbol,
    error: string
  ): ValueType {
    type = this.deref(type);
    if (type.tag === "var" || type.name !== typeName) {
      throw new Error(error);
    }
    return type;
  }
  private inScope<T>(fn: () => T): T {
    this.scope = this.scope.push();
    const res = fn();
    this.scope = this.scope.pop();
    return res;
  }
  private unifyList(left: Type[], right: Type[]): void {
    for (let i = 0; i < left.length; i++) {
      this.unify(left[i], right[i]);
    }
  }
  private unify(left: Type, right: Type): void {
    left = this.deref(left);
    right = this.deref(right);
    if (left.tag === "var") {
      this.scope.init(left.name, right);
      return;
    }
    if (right.tag === "var") {
      this.scope.init(right.name, left);
      return;
    }
    if (left.name !== right.name) throw new TypeMismatchError(left, right);
    for (const [i, type] of left.matchTypes.entries()) {
      this.unify(type, right.matchTypes[i]);
    }
  }
  private resolve(type: Type, visited = new Map<Type, Type>()): Type {
    type = this.deref(type);
    if (type.tag === "var") return type;
    const prev = visited.get(type);
    if (prev) return prev;
    const nextType: Type = {
      tag: "value",
      name: type.name,
      matchTypes: [],
      allTypes: [],
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
