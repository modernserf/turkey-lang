import { Scope } from "../scope";
import { TypeExpr } from "../types";
import {
  eqTrait,
  numTrait,
  showTrait,
  Trait,
  Traits as ITraits,
} from "./types";

export class Traits implements ITraits {
  private traits = new Scope<string, Trait>()
    .init("Num", numTrait)
    .init("Show", showTrait)
    .init("Eq", eqTrait);
  getTraitConstraint(expr: TypeExpr): Trait {
    if (expr.tag !== "identifier") {
      throw new Error("Invalid trait constraint");
    }
    if (expr.typeArgs.length) {
      throw new Error("todo");
    }
    return this.traits.get(expr.value);
  }
}
