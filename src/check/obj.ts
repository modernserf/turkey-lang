import { Scope } from "../scope";
import {
  Binding,
  EnumCase,
  Expr,
  StructFieldType,
  StructFieldValue,
  TypeBinding,
} from "../types";
import { resolveVar, unify } from "./checker";
import {
  Obj as IObj,
  BoundType,
  CheckedExpr,
  CheckedStructFieldBinding,
  Match,
  TreeWalker,
  tupleTypeName,
  tupleType,
  Type,
  TypeVar,
  boolType,
  createVar,
  createType,
  BlockScope,
} from "./types";

function createEnum(
  index: number,
  type: BoundType,
  fields: FieldMap = new Map(),
  isTuple = false
) {
  return { tag: "enum", index, type, fields, isTuple } as const;
}

type FieldMap = Map<string, { type: Type; index: number }>;
type TypeConstructor =
  | { tag: "struct"; type: BoundType; fields: FieldMap }
  | {
      tag: "enum";
      index: number;
      type: BoundType;
      fields: FieldMap;
    };

type StructInfo = { type: BoundType; fields: FieldMap; isTuple: boolean };
type EnumInfo = { type: BoundType; cases: Map<string, EnumCaseInfo> };
type EnumCaseInfo = { index: number; fields: FieldMap; isTuple: boolean };

export class Obj implements IObj {
  public treeWalker!: TreeWalker;
  public scope!: BlockScope;
  private typeConstructors = new Scope<string, TypeConstructor>();
  private structInfo = new Map<symbol, StructInfo>();
  private enumInfo = new Map<symbol, EnumInfo>();
  constructor() {
    const falseVal = createEnum(0, boolType);
    const trueVal = createEnum(1, boolType);
    this.typeConstructors.init("False", falseVal);
    this.typeConstructors.init("True", trueVal);
    this.enumInfo.set(boolType.name, {
      type: boolType,
      cases: new Map([
        ["False", falseVal],
        ["True", trueVal],
      ]),
    });
  }
  inScope<T>(fn: () => T): T {
    this.typeConstructors = this.typeConstructors.push();
    const res = fn();
    this.typeConstructors = this.typeConstructors.pop();
    return res;
  }
  createTuple(
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): CheckedExpr {
    const hints = this.tupleFieldHints(typeHint, fields.length);
    const checkedFields = fields.map((field, i) =>
      this.treeWalker.expr(field.expr, hints[i])
    );
    const type = tupleType(checkedFields.map((field) => field.type));
    return { tag: "object", fields: checkedFields, type };
  }
  checkTupleFields(
    targetType: BoundType,
    fields: CheckedStructFieldBinding[]
  ): void {
    if (targetType.name === tupleTypeName) {
      if (fields.length === targetType.parameters.length) return;
      throw new Error("Incomplete tuple destructuring");
    }
    const info = this.structInfo.get(targetType.name);
    if (!info) throw new Error("Cannot destructure");
    if (!info.isTuple || info.fields.size === fields.length) return;
    throw new Error("Incomplete tuple destructuring");
  }
  getField(
    target: BoundType,
    fieldName: string
  ): { type: BoundType; index: number } {
    if (target.name === tupleTypeName) {
      const index = Number(fieldName);
      const type = target.parameters[index];
      if (!type || type.tag === "var") {
        throw new Error("invalid field");
      }
      return { index, type };
    }
    const info = this.structInfo.get(target.name);
    if (!info) throw new Error("Cannot get field");
    const field = info.fields.get(fieldName);
    if (!field) throw new Error("Invalid field");
    const type = this.hydrateField(info.type, target, field.type);
    return { type, index: field.index };
  }
  declareStruct(
    binding: TypeBinding,
    inFields: StructFieldType[],
    isTuple: boolean
  ): void {
    const typeVars = new Scope<string, TypeVar>();
    const parameters = binding.typeParameters.map((p) => {
      const typeVar = createVar(Symbol(p.value), []);
      typeVars.init(p.value, typeVar);
      return typeVar;
    });
    const type = createType(Symbol(binding.value), parameters);

    const fields: FieldMap = new Map();
    inFields.forEach((field, index) => {
      if (fields.has(field.fieldName)) {
        throw new Error("Duplicate field");
      }
      const type = this.treeWalker.typeExpr(field.type, typeVars);
      fields.set(field.fieldName, { type, index });
    });

    this.structInfo.set(type.name, { type, fields, isTuple });
    this.typeConstructors.init(binding.value, { tag: "struct", type, fields });
    this.scope.initTypeAlias(binding.value, type);
  }
  createTagged(
    tag: string,
    inFields: StructFieldValue[],
    typeHint: BoundType | null
  ): CheckedExpr {
    const typeConstructor = this.typeConstructors.get(tag);
    if (typeConstructor.tag === "struct") {
      const hints = this.structFieldHints(typeHint, typeConstructor);

      const fieldResolver = new FieldResolver(typeConstructor.type);
      const matchedFields = new Map<string, CheckedExpr>();

      inFields.forEach((field) => {
        if (matchedFields.has(field.fieldName)) {
          throw new Error("Duplicate field");
        }
        const fieldInfo = typeConstructor.fields.get(field.fieldName);
        if (!fieldInfo) {
          throw new Error("Unknown field");
        }
        const expr = this.treeWalker.expr(
          field.expr,
          hints.get(field.fieldName) || null
        );
        matchedFields.set(field.fieldName, expr);
        fieldResolver.resolveField(fieldInfo.type, expr.type);
      });

      const orderedFields: CheckedExpr[] = Array(
        typeConstructor.fields.size
      ).fill(null);
      for (const [fieldName, { index }] of typeConstructor.fields) {
        const expr = matchedFields.get(fieldName);
        if (!expr) throw new Error("missing field");
        orderedFields[index] = expr;
      }

      return { tag: "object", type: fieldResolver.type, fields: orderedFields };
    }
    throw new Error("todo");
  }

  checkMatchTarget(_type: BoundType): Match {
    throw new Error("todo");
  }
  createList(_values: Expr[], _typeHint: BoundType | null): CheckedExpr {
    throw new Error("todo");
  }
  getIterator(_target: Expr): { target: CheckedExpr; iter: BoundType } {
    throw new Error("todo");
  }

  declareEnum(_binding: Binding, _cases: EnumCase[]): void {
    throw new Error("todo");
  }
  private tupleFieldHints(
    typeHint: BoundType | null,
    expectedSize: number
  ): Array<BoundType | null> {
    if (
      typeHint &&
      (typeHint.name !== tupleTypeName ||
        typeHint.parameters.length !== expectedSize)
    ) {
      throw new Error("Invalid type hint");
    }
    return Array(expectedSize)
      .fill(0)
      .map((_, i) => {
        if (!typeHint) return null;
        const param = typeHint.parameters[i];
        if (param.tag === "var") return null;
        return param;
      });
  }
  private structFieldHints(
    typeHint: BoundType | null,
    typeConstructor: { type: BoundType; fields: FieldMap }
  ): Map<string, BoundType> {
    if (!typeHint) {
      return new Map();
    }
    const hints: Map<string, BoundType> = new Map();
    for (const [fieldName, { type: fieldType }] of typeConstructor.fields) {
      if (fieldType.tag === "type") {
        hints.set(fieldName, fieldType);
      }
    }

    // given an abstract type, a concrete type, and an abstract fieldmap,
    // produce a concrete fieldmap
    unify(typeHint, typeConstructor.type, (res) => {
      if (res.tag !== "resolveLeft") return;
      const { value, varName } = res;
      for (const [fieldName, { type: fieldType }] of typeConstructor.fields) {
        const resolved = resolveVar(fieldType, varName, value);
        if (resolved.tag === "type") {
          hints.set(fieldName, resolved);
        }
      }
    });

    return hints;
  }
  private hydrateField(
    abstractType: BoundType,
    concreteType: BoundType,
    fieldType: Type
  ): BoundType {
    unify(abstractType, concreteType, (res) => {
      if (res.tag !== "resolveLeft") return;
      fieldType = resolveVar(fieldType, res.varName, res.value);
    });
    if (fieldType.tag === "var") throw new Error("unresolved field");
    return fieldType;
  }
}

// given an abstract type, an abstract fieldmap, and a concrete fieldmap
// produce a concrete type
class FieldResolver {
  constructor(public type: BoundType) {}
  private resolvedVars = new Map<symbol, BoundType>();
  resolveField(abstractType: Type, concreteType: BoundType) {
    if (abstractType.tag === "var") {
      const toUpdate = this.getValueToResolve(concreteType, abstractType.name);
      this.type = resolveVar(
        this.type,
        abstractType.name,
        toUpdate
      ) as BoundType;
    } else {
      unify(abstractType, concreteType, (res) => {
        if (res.tag !== "resolveLeft") return;
        const toUpdate = this.getValueToResolve(res.value, res.varName);
        this.resolvedVars.set(res.varName, toUpdate);
        this.type = resolveVar(this.type, res.varName, toUpdate) as BoundType;
      });
    }
  }
  private getValueToResolve(value: BoundType, varName: symbol) {
    const found = this.resolvedVars.get(varName);
    if (found) {
      const next = unify(found, value);
      this.resolvedVars.set(varName, next);
      return next;
    }
    this.resolvedVars.set(varName, value);
    return value;
  }
}
