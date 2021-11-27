type TypeName = symbol;
type TraitName = TypeName;

export type Impl = { tag: "impl" };

export class TraitImpls {
  private map: Map<TypeName, Map<TraitName, Impl>> = new Map();
  get(typeName: TypeName, traitName: TraitName): Impl | null {
    const traitMap = this.map.get(typeName);
    if (!traitMap) return null;
    return traitMap.get(traitName) ?? null;
  }
  init(typeName: TypeName, traitName: TraitName, impl: Impl): this {
    let traitMap = this.map.get(typeName);
    if (!traitMap) {
      traitMap = new Map<TraitName, Impl>();
      this.map.set(typeName, traitMap);
    }
    if (traitMap.has(traitName)) throw new Error("Duplicate trait impl");
    traitMap.set(traitName, impl);
    return this;
  }
}
