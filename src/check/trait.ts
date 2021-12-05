import { IRExpr } from "../ir";
import { TraitExpr } from "../ast";
import { Type, Trait, Traits as ITraits, Stdlib } from "./types";

class ImplNotFoundError extends Error {
  constructor(public type: Type, public trait: Trait) {
    super(`impl not found`);
  }
}

export class Traits implements ITraits {
  // TODO: does this need to support scope?
  private impls: Map<Type["name"], Map<Trait["name"], IRExpr>>;
  private traits: Map<string, Trait>;
  constructor(stdlib: Stdlib) {
    this.traits = stdlib.traits;
    this.impls = stdlib.impls;
  }
  provideImpl(type: Type, trait: Trait, impl: IRExpr): void {
    let implsForType = this.impls.get(type.name);
    if (!implsForType) implsForType = new Map();
    if (implsForType.has(trait.name)) {
      throw new Error("duplicate trait impl");
    }
    implsForType.set(trait.name, impl);
    this.impls.set(type.name, implsForType);
  }
  getImpl(type: Type, trait: Trait): IRExpr {
    const implsForType = this.impls.get(type.name);
    if (!implsForType) throw new ImplNotFoundError(type, trait);
    const impl = implsForType.get(trait.name);
    if (!impl) throw new ImplNotFoundError(type, trait);
    return impl;
  }
  getTrait(traitExpr: TraitExpr): Trait {
    const trait = this.traits.get(traitExpr.value);
    if (!trait) {
      throw new Error("unknown trait");
    }
    traitExpr.typeArgs.forEach((_arg) => {
      throw new Error("todo");
    });
    return trait;
  }
}
