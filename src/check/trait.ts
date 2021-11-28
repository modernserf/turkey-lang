import { Scope } from "../scope";
import { CheckedExpr, Opcode, TypeExpr } from "../types";
import {
  BoundType,
  eqTrait,
  floatType,
  intType,
  numTrait,
  showTrait,
  stringType,
  Trait,
  Traits as ITraits,
  TypedExpr,
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
  private impls = new Scope<symbol, Scope<symbol, CheckedExpr>>()
    .init(
      intType.name,
      new Scope<symbol, CheckedExpr>().init(showTrait.name, {
        tag: "object",
        fields: [{ tag: "builtIn", opcode: [Opcode.PrintNum] }],
      })
    )
    .init(
      floatType.name,
      new Scope<symbol, CheckedExpr>().init(showTrait.name, {
        tag: "object",
        fields: [{ tag: "builtIn", opcode: [Opcode.PrintNum] }],
      })
    )
    .init(
      stringType.name,
      new Scope<symbol, CheckedExpr>().init(showTrait.name, {
        tag: "object",
        fields: [{ tag: "builtIn", opcode: [Opcode.PrintStr] }],
      })
    );
  getTraitConstraint(expr: TypeExpr): Trait {
    if (expr.tag !== "identifier") {
      throw new Error("Invalid trait constraint");
    }
    if (expr.typeArgs.length) {
      throw new Error("todo");
    }
    return this.traits.get(expr.value);
  }
  boxValue(expr: TypedExpr, traits: Trait[]): TypedExpr {
    const stripped = traits.filter((t) => t.name !== numTrait.name);
    if (stripped.length === 0) return expr;
    return {
      tag: "object",
      fields: [
        expr,
        ...stripped.map((trait) => this.getImpl(trait, expr.type)),
      ],
      type: expr.type,
    };
  }
  private getImpl(trait: Trait, type: BoundType): CheckedExpr {
    return this.impls.get(type.name).get(trait.name);
  }
}
