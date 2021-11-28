import { Scope } from "../scope";
import { TypeExpr } from "../types";
import {
  eqTrait,
  numTrait,
  showTrait,
  Trait,
  Traits as ITraits,
} from "./types";

/*
how traits work:

when calling `func foo <T: Show> (arg: Cell<T>): Void {}`
with the argument of type `Cell<Int>`

the arg value is transformed from 
`{ object, [1] }`
into `{ object, [{ object, [1, show_int_impl] }] }`

when calling func, check param types against arg types
if param includes vars with trait constraints, transform the args into boxed values

enhancement: 
if calling a trait func directly (e.g. one defined in `trait`) with a concrete type,
lookup the corresponding impl func and substitute it
*/

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
