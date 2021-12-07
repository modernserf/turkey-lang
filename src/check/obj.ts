import { StrictMap } from "../strict-map";
import { Expr, EnumBinding, StructFieldValue } from "../ast";
import { Checker, CheckerProvider } from "./checker";
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
  Scope,
  Stdlib,
} from "./types";

export class Matcher implements IMatcher {
  // NOTE: a new symbol for each Matcher instance
  public binding = Symbol("MatchBinding");
  private remainingCases: Set<string>;
  constructor(private map: StrictMap<string, EnumCaseRecord>) {
    this.remainingCases = new Set(this.map.keys());
  }
  case(
    scope: Scope,
    binding: EnumBinding
  ): { index: number; block: CheckedStmt[] } {
    if (!this.remainingCases.has(binding.tagName)) {
      throw new Error("duplicate match case");
    }
    this.remainingCases.delete(binding.tagName);
    const matchCase = this.map.get(binding.tagName);
    if (binding.tag === "tuple") {
      if (matchCase.tag !== "tuple") throw new Error("match binding mismatch");
      if (binding.fields.length !== matchCase.fields.length) {
        throw new Error("match binding arity mismatch");
      }
      const block: CheckedStmt[] = binding.fields.flatMap((b, i) => {
        const { root, rest } = scope.initValue(b, matchCase.fields[i]);
        return [
          {
            tag: "let",
            binding: root,
            expr: {
              tag: "field",
              index: i + 1,
              target: { tag: "local", value: this.binding },
            },
          },
          ...rest,
        ];
      });

      return { index: matchCase.index, block };
    } else {
      if (matchCase.tag !== "record") throw new Error("match binding mismatch");

      const block: CheckedStmt[] = binding.fields.flatMap(
        ({ binding, fieldName }) => {
          const field = matchCase.fields.get(fieldName);
          const { root, rest } = scope.initValue(binding, field.type);
          return [
            {
              tag: "let",
              binding: root,
              expr: {
                tag: "field",
                index: field.index + 1,
                target: { tag: "local", value: this.binding },
              },
            },
            ...rest,
          ];
        }
      );

      return { index: matchCase.index, block };
    }
  }
  done(): void {
    if (this.remainingCases.size > 0) {
      throw new Error("incomplete match");
    }
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

export type EnumCaseRecord =
  | {
      tag: "record";
      index: number;
      fields: StrictMap<string, { type: Type; index: number }>;
    }
  | { tag: "tuple"; index: number; fields: Type[] };

export class Obj implements IObj {
  private structMap = new StrictMap<Type["name"], StructMapRecord>();
  private enumMap = new StrictMap<
    Type["name"],
    StrictMap<string, EnumCaseRecord>
  >();
  constructor(
    private stdlib: Stdlib,
    private treeWalker: TreeWalker,
    private checker: CheckerProvider
  ) {
    stdlib.types.forEach((t) => {
      switch (t.tag) {
        case "struct":
          if (t.constructor.tag === "tuple") {
            this.initTupleStruct(t.type, t.constructor.fields);
          } else {
            this.initStruct(t.type, t.constructor.fields);
          }
          return;
        case "enum": {
          const map = new StrictMap<string, EnumCaseRecord>(
            Array.from(t.constructors).map(([key, value]) => {
              if (value.tag === "record") {
                const fields = new StrictMap(
                  value.fields.map((f, index) => [
                    f.name,
                    { type: f.type, index },
                  ])
                );
                return [key, { tag: "record", index: value.index, fields }];
              } else {
                return [
                  key,
                  { tag: "tuple", index: value.index, fields: value.fields },
                ];
              }
            })
          );
          this.initEnum(t.type, map);
        }
      }
    });
  }
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
  initEnum(type: Type, cases: StrictMap<string, EnumCaseRecord>): void {
    this.enumMap.init(type.name, cases);
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
    if (ctor.type.name === tupleTypeName) {
      const value = inItems.map((item) => {
        return this.treeWalker.expr(item, null);
      });
      const type = tupleType(value.map((expr) => expr.type));
      return { tag: "object", value, type };
    }

    const fields = this.getTupleFieldTypes(ctor);
    const checker = this.checker.create();
    if (context) {
      checker.unify(ctor.type, context);
    }
    if (inItems.length !== fields.length) {
      throw new Error("tuple arity mismatch");
    }
    const checkedFields = inItems.map((item, i) => {
      let fieldType = fields[i];
      fieldType = checker.resolve(fieldType);
      const expr = this.treeWalker.expr(item, fieldType);
      checker.unify(fieldType, expr.type);
      return expr;
    });
    return this.constructObj(ctor, checker, checkedFields);
  }

  record(
    ctor: TypeConstructor,
    inFields: StructFieldValue[],
    context: Type | null
  ): CheckedExpr {
    const fields = this.getRecordFieldTypes(ctor);
    const checker = this.checker.create();
    if (context) {
      checker.unify(ctor.type, context);
    }

    const checkedFields = new StrictMap(
      inFields.map((field) => {
        let { type: fieldType } = fields.get(field.fieldName);
        fieldType = checker.resolve(fieldType);
        const expr = this.treeWalker.expr(field.expr, fieldType);
        checker.unify(fieldType, expr.type);
        return [field.fieldName, expr];
      })
    );

    const indexedFields: CheckedExpr[] = [];
    for (const [fieldName, { index }] of fields) {
      const expr = checkedFields.get(fieldName);
      indexedFields[index] = expr;
    }

    return this.constructObj(ctor, checker, indexedFields);
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
  createMatcher(expr: CheckedExpr): IMatcher {
    const data = this.enumMap.get(expr.type.name);
    return new Matcher(data);
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
  private getRecordFieldTypes(ctor: TypeConstructor) {
    if (ctor.tag === "enum") {
      const data = this.enumMap.get(ctor.type.name).get(ctor.tagName);
      if (data.tag === "tuple") {
        throw new Error("expected record, got tuple");
      }
      return data.fields;
    } else {
      const data = this.structMap.get(ctor.type.name);
      if (data.tag === "tuple") {
        throw new Error("expected record, got tuple");
      }
      return data.fields;
    }
  }
  private getTupleFieldTypes(ctor: TypeConstructor): Type[] {
    if (ctor.tag === "enum") {
      const data = this.enumMap.get(ctor.type.name).get(ctor.tagName);
      if (data.tag === "record") {
        throw new Error("expected tuple, got record");
      }
      return data.fields;
    } else {
      const data = this.structMap.get(ctor.type.name);
      if (data.tag === "record") {
        throw new Error("expected tuple, got record");
      }
      return data.fields;
    }
  }
  private constructObj(
    ctor: TypeConstructor,
    checker: Checker,
    checkedFields: CheckedExpr[]
  ): CheckedExpr {
    if (ctor.tag === "enum") {
      const indexValue = { tag: "primitive" as const, value: ctor.tagValue };
      if (checkedFields.length) {
        return {
          tag: "object",
          value: [indexValue, ...checkedFields],
          type: checker.resolve(ctor.type),
        };
      } else {
        return { ...indexValue, type: checker.resolve(ctor.type) };
      }
    } else {
      return {
        tag: "object",
        value: checkedFields,
        type: checker.resolve(ctor.type),
      };
    }
  }
}
