import { Expr, MatchBinding, StructFieldValue } from "../ast";
import { CheckerCtx } from "./checker";
import {
  Obj as IObj,
  Matcher as IMatcher,
  CheckedStmt,
  TypeConstructor,
  CheckedExpr,
  TreeWalker,
  Type,
  arrayTypeName,
  Traits,
  createVar,
  tupleTypeName,
  tupleType,
  arrayType,
} from "./types";

export class Matcher implements IMatcher {
  public binding = Symbol("MatchBinding");
  case(_binding: MatchBinding): { index: number; block: CheckedStmt[] } {
    throw new Error("todo");
  }
}

export class Obj implements IObj {
  public treeWalker!: TreeWalker;
  public traits!: Traits;
  list(
    ctor: TypeConstructor,
    inItems: Expr[],
    _context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    if (ctor.type.name !== arrayTypeName) throw new Error("todo");
    const checker = new CheckerCtx(this.traits);
    const itemType = createVar(Symbol("Result"), []);

    const value = inItems.map((item) => {
      const expr = this.treeWalker.expr(item, null);
      checker.unify(itemType, expr.type);
      return expr;
    });

    const type = arrayType(checker.resolve(itemType), value.length);

    return { tag: "object", value, type };
  }
  sizedList(
    ctor: TypeConstructor,
    inExpr: Expr,
    size: number,
    _context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    if (ctor.type.name !== arrayTypeName) throw new Error("todo");
    const expr = this.treeWalker.expr(inExpr, null);
    const type = arrayType(expr.type, size);
    return { tag: "array", init: expr, size, type };
  }
  tuple(
    ctor: TypeConstructor,
    inItems: Expr[],
    _context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    if (ctor.type.name !== tupleTypeName) throw new Error("todo");
    const value = inItems.map((item) => {
      return this.treeWalker.expr(item, null);
    });
    const type = tupleType(value.map((expr) => expr.type));
    return { tag: "object", value, type };
  }
  record(
    _ctor: TypeConstructor,
    _fields: StructFieldValue[],
    _context: Type | null
  ): CheckedExpr {
    throw new Error("todo");
  }
  getField(_expr: CheckedExpr, _value: string): CheckedExpr {
    throw new Error("todo");
  }
  getIndex(expr: CheckedExpr, index: number): CheckedExpr {
    const type = this.getIndexType(expr.type, index);
    return { tag: "field", target: expr, index, type };
  }
  createMatcher(_expr: CheckedExpr): Matcher {
    throw new Error("todo");
  }
  iter(_expr: CheckedExpr): CheckedExpr {
    throw new Error("todo");
  }
  assign(inTarget: Expr, index: number, inExpr: Expr): CheckedStmt {
    const target = this.treeWalker.expr(inTarget, null);
    const indexType = this.getIndexType(target.type, index);
    const expr = this.treeWalker.expr(inExpr, indexType);
    new CheckerCtx(this.traits).unify(expr.type, indexType);
    return { tag: "assign", target, index, expr };
  }
  private getIndexType(type: Type, index: number): Type {
    if (type.tag !== "concrete") throw new Error("cannot get index");

    switch (type.name) {
      case arrayTypeName: {
        if (index < 0 || index >= type.arraySize) {
          throw new Error("index out of bounds");
        }
        return type.parameters[0];
      }
      case tupleTypeName:
        if (index < 0 || index >= type.parameters.length) {
          throw new Error("index out of bounds");
        }
        return type.parameters[index];
      default:
        throw new Error("todo");
    }
  }
}
