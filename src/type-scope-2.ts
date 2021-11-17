import {
  TypeExpr,
  Type,
  StructFieldType,
  TypeBinding,
  EnumCase,
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
  alias(binding: TypeBinding, expr: TypeExpr) {
    this.types.init(binding.value, this.checkTypeExpr(expr));
  }
  enum(binding: TypeBinding, cases: EnumCase[]) {
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
  struct(binding: TypeBinding, fields: StructFieldType[]) {
    const type: Type = {
      tag: "struct",
      value: Symbol(binding.value),
      fields: new Map(),
    };
    this.types.init(binding.value, type);
    type.fields = this.buildFields(fields);
    this.typeConstructors.init(binding.value, { type, value: 0 });
  }
  func(
    parameters: Array<{ type: TypeExpr }>,
    returnType: TypeExpr
  ): Type & { tag: "func" } {
    return {
      tag: "func",
      parameters: parameters.map(({ type }) => this.checkTypeExpr(type)),
      returnType: this.checkTypeExpr(returnType),
    };
  }
  checkTypeExpr(type: TypeExpr): Type {
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
  unify(left: Type | null, right: Type): Type {
    if (!left) return right;
    if (left.tag !== right.tag) throw new Error("type mismatch");

    switch (left.tag) {
      case "void":
      case "integer":
      case "float":
      case "string":
        return left;
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
}
