import { createVar, Type, Trait, UnifyResult, Traits } from "./types";

export class TypeCheckError extends Error {
  constructor(public expected: Type, public received: Type) {
    super("TypeCheckError");
  }
}

export class CheckerProvider {
  constructor(private traits: Traits) {}
  check(left: Type, right: Type): void {
    const checker = this.create();
    checker.unify(left, right);
  }
  create(context = new Map<symbol, Type>()) {
    return new Checker(this.traits, context);
  }
}

export class Checker {
  constructor(private traits: Traits, private context: Map<symbol, Type>) {}
  unify(left: Type, right: Type): Type {
    return this.unifyInner(left, right, this.context, new Map()).type;
  }
  resolve(type: Type): Type {
    type = this.deref(this.context, type);
    if (type.tag === "abstract") return type;
    return {
      ...type,
      parameters: type.parameters.map((t) => this.resolve(t)),
    };
  }
  private unifyInner(
    left: Type,
    right: Type,
    leftResults: Map<symbol, Type>,
    rightResults: Map<symbol, Type>
  ): UnifyResult {
    left = this.deref(leftResults, left);
    right = this.deref(rightResults, right);
    if (left.tag === "abstract") {
      if (right.tag === "abstract") {
        const type = createVar(
          Symbol(`${left.name.description} + ${right.name.description}`),
          this.unionTraits(left.traits, right.traits)
        );
        return {
          type,
          leftResults: leftResults.set(left.name, type),
          rightResults: rightResults.set(right.name, type),
        };
      } else {
        this.checkTraits(left.traits, right);
        return {
          type: right,
          leftResults: leftResults.set(left.name, right),
          rightResults,
        };
      }
    } else {
      if (right.tag === "abstract") {
        this.checkTraits(right.traits, left);
        return {
          type: left,
          leftResults,
          rightResults: leftResults.set(right.name, left),
        };
      } else {
        if (
          left.name !== right.name ||
          left.parameters.length !== right.parameters.length ||
          left.arraySize !== right.arraySize
        ) {
          throw new TypeCheckError(left, right);
        }
        const rParams = right.parameters;

        const parameters = left.parameters.map(
          (l, i) =>
            this.unifyInner(l, rParams[i], leftResults, rightResults).type
        );
        return {
          type: { ...left, parameters },
          leftResults,
          rightResults,
        };
      }
    }
  }
  private deref(map: Map<symbol, Type>, type: Type): Type {
    if (type.tag === "abstract") {
      if (map.has(type.name)) return map.get(type.name) as Type;
    }
    return type;
  }
  private unionTraits(left: Trait[], right: Trait[]): Trait[] {
    // TODO
    return [...left, ...right];
  }
  private checkTraits(traits: Trait[], concreteType: Type): void {
    traits.forEach((trait) => {
      this.traits.getImpl(concreteType, trait);
    });
  }
}
