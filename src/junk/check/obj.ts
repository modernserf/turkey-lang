import { Scope } from "../../scope";
import {
  CheckedMatchCase,
  CheckedStructFieldBinding,
  EnumCase,
  Expr,
  MatchBinding,
  StructFieldType,
  StructFieldValue,
} from "../../types";
import { resolveVar, unify } from "./checker";
import {
  Obj as IObj,
  Match as IMatch,
  BoundType,
  TypedExpr,
  TreeWalker,
  tupleTypeName,
  tupleType,
  Type,
  createType,
  BlockScope,
  intType,
  listType,
  Traits,
  TypeParamScope,
  TypeConstructor,
  StructInfo,
  EnumInfo,
  EnumCaseInfo,
  FieldMap,
} from "./types";

export class Obj implements IObj {
  public treeWalker!: TreeWalker;
  public scope!: BlockScope;
  public traits!: Traits;
  private typeConstructors = new Scope<string, TypeConstructor>();
  private structInfo = new Map<symbol, StructInfo>();
  private enumInfo = new Map<symbol, EnumInfo>();
  constructor(
    typeConstructors: Array<[string, TypeConstructor]>,
    enumInfo: Array<[BoundType, Array<[string, EnumCaseInfo]>]>
  ) {
    typeConstructors.forEach(([name, ctor]) => {
      this.typeConstructors.init(name, ctor);
    });
    enumInfo.forEach(([type, rows]) => {
      const enumInfo: EnumInfo = { type, cases: new Map() };
      for (const [name, caseInfo] of rows) {
        enumInfo.cases.set(name, caseInfo);
      }
      this.enumInfo.set(type.name, enumInfo);
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
  ): TypedExpr {
    const hints = this.tupleFieldHints(typeHint, fields.length);
    const checkedFields = fields.map((field, i) =>
      this.treeWalker.expr(field.expr, hints[i])
    );
    const type = tupleType(checkedFields.map((field) => field.type));
    return { tag: "object", fields: checkedFields, type };
  }
  checkTupleFields(targetType: BoundType, size: number): void {
    if (targetType.name === tupleTypeName) {
      if (size === targetType.parameters.length) return;
      throw new Error("Incomplete tuple destructuring");
    }
    const info = this.structInfo.get(targetType.name);
    if (!info) throw new Error("Cannot destructure");
    if (!info.isTuple || info.fields.size === size) return;
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
    const type = hydrateField(info.type, target, field.type);
    return { type, index: field.index };
  }
  createTagged(
    tag: string,
    inFields: StructFieldValue[],
    typeHint: BoundType | null
  ): TypedExpr {
    const typeConstructor = this.typeConstructors.get(tag);
    const hints = this.fieldHints(typeHint, typeConstructor);
    const fieldResolver = new FieldResolver(typeConstructor.type);
    const matchedFields = new Map<string, TypedExpr>();

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

    let size = typeConstructor.fields.size;
    // enums without fields are compiled as integers
    if (size === 0 && typeConstructor.tag === "enum") {
      return {
        tag: "primitive",
        value: typeConstructor.index,
        type: fieldResolver.type,
      };
    }

    if (typeConstructor.tag === "enum") {
      size = size + 1;
    }
    const orderedFields: TypedExpr[] = Array(size).fill(null);
    if (typeConstructor.tag === "enum") {
      orderedFields[0] = {
        tag: "primitive",
        value: typeConstructor.index,
        type: intType,
      };
    }

    for (const [fieldName, { index }] of typeConstructor.fields) {
      const expr = matchedFields.get(fieldName);
      if (!expr) throw new Error("missing field");
      orderedFields[index] = expr;
    }

    return { tag: "object", type: fieldResolver.type, fields: orderedFields };
  }

  checkMatchTarget(concreteType: BoundType): IMatch {
    const enumInfo = this.enumInfo.get(concreteType.name);
    if (!enumInfo) throw new Error("invalid match target");
    return new Match(enumInfo, concreteType, this.scope);
  }
  createList(values: Expr[], typeHint: BoundType | null): TypedExpr {
    let iterTypeHint: BoundType | null = null;
    if (typeHint) {
      iterTypeHint = this.getIterType(typeHint);
    }
    const checked = values.map((expr) =>
      this.treeWalker.expr(expr, iterTypeHint)
    );
    const iterType = checked.length
      ? checked.map((c) => c.type).reduce((l, r) => unify(l, r))
      : iterTypeHint;

    const type = iterType
      ? createType(listType.name, [iterType], listType.traits)
      : listType;
    const nil: TypedExpr = { tag: "primitive", value: 0, type };
    return checked.reduceRight((rest, expr) => {
      return {
        tag: "object",
        type,
        fields: [{ tag: "primitive", value: 1, type }, expr, rest],
      };
    }, nil);
  }
  getIterator(target: Expr): { target: TypedExpr; iter: BoundType } {
    const checked = this.treeWalker.expr(target, null);
    const iter = this.getIterType(checked.type);
    if (!iter) throw new Error("unbound iterator");
    return { target: checked, iter };
  }
  private getIterType(target: BoundType): BoundType | null {
    if (target.name !== listType.name) throw new Error("Not iterable");
    const iter = target.parameters[0];
    if (iter.tag === "var") return null;
    return iter;
  }
  declareStruct(
    name: string,
    typeParameters: TypeParamScope,
    inFields: StructFieldType[],
    isTuple: boolean
  ): void {
    const type = this.createType(name, typeParameters);
    this.scope.initTypeAlias(name, type);
    const fields = this.buildFieldsMap(inFields, typeParameters, 0);

    this.structInfo.set(type.name, { type, fields, isTuple });
    this.typeConstructors.init(name, { tag: "struct", type, fields });
  }
  declareEnum(
    name: string,
    typeParameters: TypeParamScope,
    inCases: EnumCase[]
  ): void {
    const type = this.createType(name, typeParameters);
    this.scope.initTypeAlias(name, type);
    const cases = new Map<string, EnumCaseInfo>();
    inCases.forEach((enumCase, index) => {
      const { isTuple, tagName, fields: inFields } = enumCase;
      if (cases.has(tagName)) {
        throw new Error("Duplicate enum case");
      }
      const fields = this.buildFieldsMap(inFields, typeParameters, 1);
      cases.set(tagName, { fields, index, isTuple });
      this.typeConstructors.init(tagName, { tag: "enum", index, type, fields });
    });
    this.enumInfo.set(type.name, { type, cases });
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
  private fieldHints(
    typeHint: BoundType | null,
    typeConstructor: TypeConstructor
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
      if (res.tag === "ok") return;
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
  private createType(name: string, typeParams: TypeParamScope): BoundType {
    return createType(Symbol(name), Array.from(typeParams.values()), []);
  }
  private buildFieldsMap(
    inFields: StructFieldType[],
    typeVars: TypeParamScope,
    offset: number
  ) {
    const fields: FieldMap = new Map();
    inFields.forEach((field, i) => {
      if (fields.has(field.fieldName)) {
        throw new Error("Duplicate field");
      }
      const index = i + offset;
      const type = this.treeWalker.typeExpr(field.type, typeVars);
      fields.set(field.fieldName, { type, index });
    });
    return fields;
  }
}

function hydrateField(
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

class Match implements IMatch {
  constructor(
    private enumInfo: EnumInfo,
    private concreteType: BoundType,
    private scope: BlockScope
  ) {}
  matchBinding(matchBinding: MatchBinding): CheckedStructFieldBinding[] {
    const enumCase = this.enumInfo.cases.get(matchBinding.value);
    if (!enumCase) throw new Error("Unknown case");
    return matchBinding.fields.map(({ binding, fieldName }) => {
      const field = enumCase.fields.get(fieldName);
      if (!field) throw new Error("Invalid field");
      const type = hydrateField(
        this.enumInfo.type,
        this.concreteType,
        field.type
      );
      const checkedBinding = this.scope.initVar(binding, type);
      return { fieldIndex: field.index, binding: checkedBinding };
    });
  }
  sortCases(cases: CheckedMatchCase[]): CheckedMatchCase[] {
    const map = new Map<string, CheckedMatchCase>();
    for (const matchCase of cases) {
      if (map.has(matchCase.tag)) {
        throw new Error("Duplicate case");
      }
      map.set(matchCase.tag, matchCase);
    }
    const orderedCases: CheckedMatchCase[] = Array(
      this.enumInfo.cases.size
    ).fill(null);
    for (const [tag, enumCase] of this.enumInfo.cases) {
      const found = map.get(tag);
      if (!found) {
        throw new Error("Missing case");
      }
      orderedCases[enumCase.index] = found;
    }
    return orderedCases;
  }
}
