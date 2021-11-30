import { BoundType, Impl, StdLib, Trait } from "./types";

export class Traits {
  private traitNames: Map<string, Trait> = new Map();
  private traitImpls: Map<symbol, Map<symbol, Impl>> = new Map();
  constructor(stdlib: StdLib) {
    stdlib.impls.forEach((row) => {
      const typeMap = new Map(
        row.impls.map((impl) => [
          impl.type.name,
          { tag: "impl" as const, attrs: impl.attrs },
        ])
      );
      this.traitImpls.set(row.trait.name, typeMap);
    });
  }
  get(name: string): Trait {
    const found = this.traitNames.get(name);
    if (!found) throw new Error();
    return found;
  }
  getImpl(trait: Trait, type: BoundType): Impl {
    const impls = this.traitImpls.get(trait.name);
    if (!impls) throw new Error();
    const impl = impls.get(type.name);
    if (!impl) throw new Error();
    return impl;
  }
}
