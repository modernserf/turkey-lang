import { TraitImpls } from "./trait";
import { BoundType, Type, TypeVar } from "./types";

export class TypeCheckError extends Error {
  constructor(public left: BoundType, public right: BoundType) {
    super(
      `TypeCheckError: expected ${left.name.description}, received ${right.name.description}`
    );
  }
}

export function typeVar(name: string, ...traits: BoundType[]): TypeVar {
  return { tag: "var", name: Symbol(name), traits };
}

export function primitive(name: string): BoundType {
  return { tag: "type", name: Symbol(name), parameters: [] };
}

export function makeType(name: symbol, parameters: Type[]): BoundType {
  return { tag: "type", name: name, parameters };
}

export function trait(name: string): BoundType {
  const self = typeVar("Self");
  return { tag: "type", name: Symbol(name), parameters: [self] };
}

export class Checker {
  private state: Map<symbol, Type> = new Map();
  constructor(private traitImpls: TraitImpls) {}
  unify(left: Type, right: Type): void {
    left = this.deref(left);
    right = this.deref(right);
    if (left.tag === "var") return this.assign(left, right);
    if (right.tag === "var") return this.assign(right, left);

    if (left.name !== right.name) throw new TypeCheckError(left, right);
    const rightParams = right.parameters;
    left.parameters.forEach((param, i) => this.unify(param, rightParams[i]));
  }
  mustResolve(tv: Type): BoundType {
    const res = this.resolve(tv);
    if (res.tag === "var") throw new Error("not resolved");
    return res;
  }
  resolve(tv: Type): Type {
    tv = this.deref(tv);
    if (tv.tag === "var") return tv;
    return makeType(
      tv.name,
      tv.parameters.map((param) => this.resolve(param))
    );
  }
  private assign(binding: TypeVar, tv: Type): void {
    // prevent a variable from assigning to itself
    if (tv.name === binding.name) return;
    // check traits
    if (tv.tag === "type") {
      for (const trait of binding.traits) {
        if (!this.traitImpls.get(tv.name, trait.name)) {
          throw new Error("Trait mismatch");
        }
      }
    } else {
      if (binding.traits.length) {
        throw new Error("TODO: unifying traits on vars");
      }
    }

    this.state.set(binding.name, tv);
  }
  private deref(tv: Type): Type {
    while (tv.tag === "var") {
      const next = this.state.get(tv.name);
      if (next) {
        tv = next;
      } else {
        return tv;
      }
    }
    return tv;
  }
}
