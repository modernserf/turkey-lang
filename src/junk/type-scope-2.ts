import {
  TypeExpr,
  Type,
  StructFieldType,
  TypeBinding,
  EnumCase,
  CheckedStructFieldType,
  TypeParam,
} from "../types";
import { Scope } from "../scope";
import { mapMap } from "../utils";

type ConstructableType = Type & ({ tag: "struct" } | { tag: "enum" });
export type TypeConstructor = { value: number; type: ConstructableType };

// istanbul ignore next
function logType(type: Type): string {
  switch (type.tag) {
    case "var":
    case "primitive":
    case "enum":
    case "struct":
      return type.value.description || "<anon>";
    case "func":
      return "func";
  }
}

export class TypeMismatchError extends Error {
  constructor(left: Type, right: Type) {
    super(`mismatch between ${logType(left)} & ${logType(right)}`);
  }
}

type StructType = Type & { tag: "struct" };

class TupleState {
  private tuples: Map<number, StructType> = new Map();
  get(size: number): StructType {
    const val = this.tuples.get(size);
    if (val) return val;
    const type = this.makeTupleType(size);
    this.tuples.set(size, type);
    return type;
  }
  private makeTupleType(size: number): StructType {
    const parameters: Type[] = Array(size)
      .fill(null)
      .map((_, i) => ({ tag: "var", value: Symbol(i) }));

    return {
      tag: "struct",
      value: Symbol(`tuple ${size}`),
      parameters,
      fields: new Map(
        parameters.map((type, index) => [String(index), { type, index }])
      ),
    };
  }
}

export class TypeScope {
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, TypeConstructor>;
  private vars: Scope<symbol, Type> = new Scope();
  private tuples = new TupleState();
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
  getTuple(size: number): StructType {
    return this.tuples.get(size);
  }
  // create & store types
  alias(binding: TypeBinding, expr: TypeExpr): void {
    this.types.init(binding.value, this.checkTypeExpr(expr));
  }
  enumType(binding: TypeBinding, cases: EnumCase[]): void {
    const type = this.withScope(() => {
      const type: Type = {
        tag: "enum",
        value: Symbol(binding.value),
        parameters: [],
        cases: new Map(),
      };
      this.types.init(binding.value, type);
      for (const typeParam of binding.typeParameters) {
        const param: Type = {
          tag: "var",
          value: Symbol(typeParam.value),
        };
        type.parameters.push(param);
        this.types.init(typeParam.value, param);
      }

      for (const [i, enumCase] of cases.entries()) {
        type.cases.set(enumCase.tagName, {
          index: i,
          fields: this.buildFields(enumCase.fields),
        });
      }
      return type;
    });
    this.types.init(binding.value, type);
    for (const [i, enumCase] of cases.entries()) {
      this.typeConstructors.init(enumCase.tagName, { type, value: i });
    }
  }
  structType(binding: TypeBinding, fields: StructFieldType[]): void {
    const type = this.withScope(() => {
      const type: Type = {
        tag: "struct",
        value: Symbol(binding.value),
        parameters: [],
        fields: new Map(),
      };
      this.types.init(binding.value, type);
      for (const typeParam of binding.typeParameters) {
        const param: Type = {
          tag: "var",
          value: Symbol(typeParam.value),
        };
        type.parameters.push(param);
        this.types.init(typeParam.value, param);
      }

      type.fields = this.buildFields(fields);
      return type;
    });
    this.types.init(binding.value, type);
    this.typeConstructors.init(binding.value, { type, value: 0 });
  }
  forwardType(typeExpr: TypeExpr | null): Type {
    if (!typeExpr) {
      return { tag: "var", value: Symbol("forwardType") };
    }
    return this.checkTypeExpr(typeExpr);
  }
  func(
    typeParameters: TypeParam[],
    parameters: Array<{ type: TypeExpr }>,
    returnType: TypeExpr
  ): Type & { parameters: Type[]; returnType: Type } {
    return this.withScope(() => {
      this.initParams(typeParameters);

      return {
        tag: "func",
        parameters: parameters.map(({ type }) => this.checkTypeExpr(type)),
        returnType: this.checkTypeExpr(returnType),
      };
    });
  }
  structValue(type: Type & { tag: "struct" }): Type {
    return {
      tag: "struct",
      value: type.value,
      parameters: type.parameters.map((param) => this.deref(param)),
      fields: mapMap(type.fields, (value) => {
        return {
          index: value.index,
          type: this.deref(value.type),
        };
      }),
    };
  }
  enumValue(type: Type & { tag: "enum" }): Type {
    return {
      tag: "enum",
      value: type.value,
      parameters: type.parameters.map((param) => this.deref(param)),
      cases: mapMap(type.cases, (value) => {
        return {
          index: value.index,
          fields: mapMap(value.fields, (field) => ({
            index: field.index,
            type: this.deref(field.type),
          })),
        };
      }),
    };
  }
  callValue(type: Type): Type {
    return this.deref(type);
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
    type: Type | null,
    parameters: any[]
  ): Type & { parameters: Type[]; returnType: Type } {
    if (!type) throw new Error("missing type for closure");
    type = this.unwrap(type);
    if (type.tag !== "func") throw new Error("non-function type");
    if (type.parameters.length !== parameters.length) {
      throw new Error("arity mismatch");
    }
    return type;
  }
  checkField(type: Type, fieldName: string): CheckedStructFieldType {
    type = this.unwrap(type);
    if (type.tag !== "struct") {
      throw new Error("can only destructure structs");
    }
    const typeField = type.fields.get(fieldName);
    if (!typeField) throw new Error("invalid field");

    return { index: typeField.index, type: this.deref(typeField.type) };
  }
  checkBuiltInCall(type: Type): Type {
    return this.unwrap(type);
  }
  ///
  unify(left: Type, right: Type): Type {
    left = this.deref(left);
    right = this.deref(right);

    if (left.tag === "var") {
      this.vars.set(left.value, right);
      return right;
    }
    if (right.tag === "var") {
      this.vars.set(right.value, left);
      return left;
    }

    switch (left.tag) {
      case "primitive":
      case "enum":
        if (left.tag !== right.tag) throw new TypeMismatchError(left, right);
        if (left.value === right.value) return left;
        throw new TypeMismatchError(left, right);
      case "struct": {
        if (left.tag !== right.tag || left.value !== right.value) {
          throw new TypeMismatchError(left, right);
        }
        const rightParams = right.parameters;
        const parameters = left.parameters.map((param, i) => {
          return this.unify(param, rightParams[i]);
        });
        return {
          tag: "struct",
          value: left.value,
          parameters,
          fields: left.fields,
        };
      }
      case "func": {
        if (left.tag !== right.tag) throw new TypeMismatchError(left, right);
        const returnType = this.unify(left.returnType, right.returnType);
        if (left.parameters.length !== right.parameters.length) {
          throw new Error("arity mismatch");
        }
        const rightParams = right.parameters;
        const parameters = left.parameters.map((param, i) => {
          return this.unify(param, rightParams[i]);
        });

        return { tag: "func", parameters, returnType };
      }
    }
  }
  withScope<T>(fn: () => T): T {
    this.types = this.types.push();
    this.typeConstructors = this.typeConstructors.push();
    this.vars = this.vars.push();
    const res = fn();
    this.vars = this.vars.pop();
    this.typeConstructors = this.typeConstructors.pop();
    this.types = this.types.pop();
    return res;
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
  private initParams(typeParameters: TypeParam[]) {
    for (const typeParam of typeParameters) {
      this.types.init(typeParam.value, {
        tag: "var",
        value: Symbol(typeParam.value),
      });
    }
  }
  private deref(type: Type, visited = new Set<symbol>()): Type {
    switch (type.tag) {
      case "var": {
        if (visited.has(type.value)) return type;
        visited.add(type.value);
        if (this.vars.has(type.value)) {
          return this.deref(this.vars.get(type.value), visited);
        } else {
          return type;
        }
      }
      case "primitive":
        return type;
      case "func":
        return {
          tag: "func",
          parameters: type.parameters.map((type) => this.deref(type, visited)),
          returnType: this.deref(type.returnType),
        };
      case "struct":
        return {
          tag: "struct",
          value: type.value,
          parameters: type.parameters.map((type) => this.deref(type, visited)),
          fields: type.fields,
        };
      case "enum":
        return {
          tag: "enum",
          value: type.value,
          parameters: type.parameters.map((type) => this.deref(type, visited)),
          cases: type.cases,
        };
    }
  }
  private unwrap(type: Type): Type {
    const deref = this.deref(type);
    if (deref.tag === "var") {
      throw new Error(`unbound type variable ${deref.value.description}`);
    }
    return deref;
  }
  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.tag) {
      case "identifier":
        return this.types.get(type.value);
      case "tuple": {
        const baseType = this.tuples.get(type.typeArgs.length);
        const parameters = type.typeArgs.map((type) =>
          this.checkTypeExpr(type)
        );
        return {
          tag: "struct",
          value: baseType.value,
          parameters,
          fields: new Map(
            parameters.map((type, index) => [String(index), { type, index }])
          ),
        };
      }
      case "func":
        return {
          tag: "func",
          parameters: type.parameters.map((param) => this.checkTypeExpr(param)),
          returnType: this.checkTypeExpr(type.returnType),
        };
    }
  }
}
