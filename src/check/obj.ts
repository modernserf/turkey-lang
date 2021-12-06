import { StrictMap } from "../strict-map";
import { Expr, EnumBinding, StructFieldValue } from "../ast";
import { CheckerProvider } from "./checker";
import {
  Obj as IObj,
  Matcher as IMatcher,
  CheckedStmt,
  TypeConstructor,
  CheckedExpr,
  TreeWalker,
  Type,
  arrayTypeName,
  createVar,
  tupleTypeName,
  tupleType,
  arrayType,
} from "./types";

export class Matcher implements IMatcher {
  public binding = Symbol("MatchBinding");
  case(_binding: EnumBinding): { index: number; block: CheckedStmt[] } {
    throw new Error("todo");
  }
}

type StructMapRecord =
  | {
      tag: "record";
      baseType: Type;
      fields: StrictMap<string, { type: Type; index: number }>;
    }
  | {
      tag: "tuple";
      baseType: Type;
      fields: Type[];
    };

export class Obj implements IObj {
  private structMap = new StrictMap<Type["name"], StructMapRecord>();
  constructor(
    private treeWalker: TreeWalker,
    private checker: CheckerProvider
  ) {}
  initStruct(type: Type, fields: Array<{ name: string; type: Type }>): void {
    const fieldsMap = new StrictMap(
      fields.map((f, index) => [f.name, { type: f.type, index }])
    );
    this.structMap.init(type.name, {
      tag: "record",
      baseType: type,
      fields: fieldsMap,
    });
  }
  initTupleStruct(type: Type, fields: Type[]): void {
    this.structMap.init(type.name, { tag: "tuple", baseType: type, fields });
  }
  list(
    ctor: TypeConstructor,
    inItems: Expr[],
    _context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    if (ctor.type.name !== arrayTypeName) throw new Error("todo");
    const checker = this.checker.create();
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
    context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    if (ctor.type.name === tupleTypeName) {
      const value = inItems.map((item) => {
        return this.treeWalker.expr(item, null);
      });
      const type = tupleType(value.map((expr) => expr.type));
      return { tag: "object", value, type };
    } else {
      const data = this.structMap.get(ctor.type.name);
      if (data.tag === "record") throw new Error("expected tuple, got record");
      const checker = this.checker.create();
      if (context) {
        checker.unify(data.baseType, context);
      }
      if (inItems.length !== data.fields.length) {
        throw new Error("tuple arity mismatch");
      }
      const checkedFields = inItems.map((item, i) => {
        let fieldType = data.fields[i];
        fieldType = checker.resolve(fieldType);
        const expr = this.treeWalker.expr(item, fieldType);
        checker.unify(fieldType, expr.type);
        return expr;
      });

      return {
        tag: "object",
        value: checkedFields,
        type: checker.resolve(ctor.type),
      };
    }
  }
  record(
    ctor: TypeConstructor,
    inFields: StructFieldValue[],
    context: Type | null
  ): CheckedExpr {
    if (ctor.tag === "enum") throw new Error("todo");
    const data = this.structMap.get(ctor.type.name);
    if (data.tag === "tuple") throw new Error("expected record, got tuple");
    const checker = this.checker.create();
    if (context) {
      checker.unify(data.baseType, context);
    }

    const checkedFields = new StrictMap(
      inFields.map((field) => {
        let { type: fieldType } = data.fields.get(field.fieldName);
        fieldType = checker.resolve(fieldType);
        const expr = this.treeWalker.expr(field.expr, fieldType);
        checker.unify(fieldType, expr.type);
        return [field.fieldName, expr];
      })
    );

    const indexedFields: CheckedExpr[] = [];
    for (const [fieldName, { index }] of data.fields) {
      const expr = checkedFields.get(fieldName);
      indexedFields[index] = expr;
    }

    return {
      tag: "object",
      value: indexedFields,
      type: checker.resolve(ctor.type),
    };
  }
  getField(expr: CheckedExpr, value: string): CheckedExpr {
    const data = this.structMap.get(expr.type.name);
    if (data.tag === "tuple") throw new Error("expected record, got tuple");
    const checker = this.checker.create();
    checker.unify(data.baseType, expr.type);
    const { type: fieldType, index } = data.fields.get(value);
    const type = checker.resolve(fieldType);

    return { tag: "field", target: expr, index, type };
  }
  getIndex(expr: CheckedExpr, index: number): CheckedExpr {
    const type = this.getIndexType(expr.type, index);
    return { tag: "field", target: expr, index, type };
  }
  getTupleItems(expr: CheckedExpr): CheckedExpr[] {
    if (expr.type.tag !== "concrete") throw new Error("cannot get index");
    if (expr.type.name === tupleTypeName) {
      return expr.type.parameters.map((type, index) => {
        return { tag: "field", target: expr, index, type };
      });
    }
    const data = this.structMap.get(expr.type.name);
    if (data.tag === "record") {
      throw new Error("expected tuple, got record");
    }
    const checker = this.checker.create();
    checker.unify(data.baseType, expr.type);
    return data.fields.map((type, index) => {
      return { tag: "field", target: expr, index, type };
    });
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
    this.checker.check(expr.type, indexType);
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
      default: {
        const data = this.structMap.get(type.name);
        if (data.tag === "record") {
          throw new Error("expected tuple, got record");
        }
        const checker = this.checker.create();
        checker.unify(data.baseType, type);
        return checker.resolve(data.fields[index]);
      }
    }
  }
}
