import {
  TypeExpr,
  Type,
  StructFieldType,
  TypeBinding,
  EnumCase,
  CheckedStructFieldType,
} from "./types";
import { Scope } from "./scope";

type ConstructableType = Type & ({ tag: "struct" } | { tag: "enum" });
export type TypeConstructor = { value: number; type: ConstructableType };

export class TypeScope {
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, TypeConstructor>;
  constructor(
    builtInTypes: Scope<string, Type>,
    builtInTypeConstructors: Scope<string, TypeConstructor>
  ) {
    this.types = builtInTypes.push();
    this.typeConstructors = builtInTypeConstructors.push();
  }
  getConstructor(name: string): TypeConstructor {
    return this.typeConstructors.get(name);
  }
  // create & store types
  alias(binding: TypeBinding, expr: TypeExpr): void {
    this.types.init(binding.value, this.checkTypeExpr(expr));
  }
  enum(binding: TypeBinding, cases: EnumCase[]): void {
    const type: Type = {
      tag: "enum",
      value: Symbol(binding.value),
      cases: new Map(),
    };
    this.types.init(binding.value, type);
    for (const [i, enumCase] of cases.entries()) {
      this.typeConstructors.init(enumCase.tagName, { type, value: i });
      type.cases.set(enumCase.tagName, {
        index: i,
        fields: this.buildFields(enumCase.fields),
      });
    }
  }
  struct(binding: TypeBinding, fields: StructFieldType[]): void {
    const type: Type = {
      tag: "struct",
      value: Symbol(binding.value),
      fields: new Map(),
    };
    this.types.init(binding.value, type);
    type.fields = this.buildFields(fields);
    this.typeConstructors.init(binding.value, { type, value: 0 });
  }
  forwardType(typeExpr: TypeExpr | null): Type {
    if (!typeExpr) {
      return { tag: "var", value: Symbol("forwardType"), type: null };
    }
    return this.checkTypeExpr(typeExpr);
  }
  func(
    parameters: Array<{ type: TypeExpr }>,
    returnType: TypeExpr
  ): Type & { parameters: Type[]; returnType: Type } {
    return {
      tag: "func",
      parameters: parameters.map(({ type }) => this.checkTypeExpr(type)),
      returnType: this.checkTypeExpr(returnType),
    };
  }
  // check if types can be used for purpose
  checkEnum(type: Type): Type & {
    cases: Map<
      string,
      {
        index: number;
        fields: Map<string, CheckedStructFieldType>;
      }
    >;
  } {
    type = this.unwrap(type);
    if (type.tag !== "enum") {
      throw new Error("can only pattern match with enums");
    }
    return type;
  }
  checkFunc(
    forwardType: Type | null,
    parameters: any[]
  ): Type & { parameters: Type[]; returnType: Type } {
    if (!forwardType) throw new Error("missing type for closure");
    forwardType = this.unwrap(forwardType);
    if (forwardType.tag !== "func") throw new Error("non-function type");
    if (forwardType.parameters.length !== parameters.length) {
      throw new Error("arity mismatch");
    }
    return forwardType;
  }
  getField(type: Type, fieldName: string): CheckedStructFieldType {
    type = this.unwrap(type);
    if (type.tag !== "struct") {
      throw new Error("can only destructure structs");
    }
    const typeField = type.fields.get(fieldName);
    if (!typeField) throw new Error("invalid field");
    return typeField;
  }
  ///
  unify(left: Type, right: Type): Type {
    if (left.tag === "var") {
      if (left.type) return this.unify(left.type, right);
      left.type = right;
      return left;
    }
    if (right.tag === "var") {
      if (right.type) return this.unify(left, right.type);
      right.type = left;
      return right;
    }
    if (left.tag !== right.tag) throw new Error("type mismatch");

    switch (left.tag) {
      case "primitive":
      case "struct":
      case "enum":
        if (left.value === (right as typeof left).value) return left;
        throw new Error("type mismatch");
      case "func": {
        const returnType = this.unify(
          left.returnType,
          (right as typeof left).returnType
        );
        if (
          left.parameters.length !== (right as typeof left).parameters.length
        ) {
          throw new Error("arity mismatch");
        }
        const parameters = left.parameters.map((param, i) => {
          return this.unify(param, (right as typeof left).parameters[i]);
        });

        return { tag: "func", parameters, returnType };
      }
    }
  }
  private buildFields(fields: StructFieldType[]) {
    const fieldsResult = new Map<string, { type: Type; index: number }>();
    for (const field of fields) {
      if (fieldsResult.has(field.fieldName)) {
        throw new Error("duplicate field");
      }
      fieldsResult.set(field.fieldName, {
        type: this.checkTypeExpr(field.type),
        index: fieldsResult.size,
      });
    }

    return fieldsResult;
  }
  private unwrap(type: Type, visited = new Set<symbol>()): Type {
    if (type.tag !== "var") return type;
    // istanbul ignore next
    if (visited.has(type.value)) throw new Error("infinte loop in type var");
    visited.add(type.value);
    if (type.type) return this.unwrap(type.type, visited);
    throw new Error("unbound type variable");
  }
  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.tag) {
      case "identifier":
        return this.types.get(type.value);
      case "func":
        return {
          tag: "func",
          parameters: type.parameters.map((param) => this.checkTypeExpr(param)),
          returnType: this.checkTypeExpr(type.returnType),
        };
    }
  }
}
