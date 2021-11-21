import { Scope } from "./scope";
import { TypeChecker } from "./type-scope-4";
import {
  Binding,
  CheckedBinding,
  CheckedExpr,
  CheckedStructFieldBinding,
  Expr,
  StructFieldBinding,
  Trait,
  Type,
  ValueType,
} from "./types";

type FieldInfo =
  | { tag: "concrete"; compileIndex: number; type: Type }
  | { tag: "parameterized"; compileIndex: number; paramIndex: number };

type FieldResult = { type: Type; index: number };

export class Case {
  private fields: Scope<string, FieldInfo> = new Scope();
  private size = 0;
  public index = 0;
  private isEnum = false;
  constructor(
    public readonly type: ValueType,
    private isTuple: boolean,
    index?: number
  ) {
    if (index !== undefined) {
      this.index = index;
      this.isEnum = true;
      this.size = 1;
    }
  }
  addConcreteField(name: string, type: Type) {
    this.fields.init(name, {
      tag: "concrete",
      type,
      compileIndex: this.size++,
    });
  }
  getField(name: string): FieldResult {
    const info = this.fields.get(name);
    switch (info.tag) {
      case "concrete":
        return { type: info.type, index: info.compileIndex };
      case "parameterized":
        throw new Error("todo");
    }
  }
  construct(
    inFields: Array<{ fieldName: string; expr: Expr }>,
    checkExpr: (expr: Expr, type: Type | null) => CheckedExpr
  ): CheckedExpr {
    const checker = new TypeChecker();
    const map = new Scope<string, CheckedExpr>();
    for (const { fieldName, expr } of inFields) {
      const info = this.fields.get(fieldName);
      switch (info.tag) {
        case "parameterized":
          throw new Error("todo");
        case "concrete": {
          const checked = checkExpr(expr, info.type);
          checker.unify(checked.type, info.type);
          map.init(fieldName, checked);
        }
      }
    }

    const outFields = Array.from(this.fields).map(([fieldName]) =>
      map.get(fieldName)
    );

    if (this.isEnum) {
      return {
        tag: "enum",
        type: this.type,
        fields: outFields,
        index: this.index,
      };
    } else {
      return { tag: "struct", type: this.type, fields: outFields };
    }
  }
  destructure(
    bindings: StructFieldBinding[],
    initScopeBinding: (binding: Binding, type: Type) => CheckedBinding
  ): CheckedStructFieldBinding[] {
    if (this.isTuple && this.fields.size !== bindings.length) {
      throw new Error("invalid tuple destructuring");
    }
    return bindings.map(({ fieldName, binding }) => {
      const info = this.fields.get(fieldName);
      switch (info.tag) {
        case "parameterized":
          throw new Error("todo");
        case "concrete":
          return {
            fieldIndex: info.compileIndex,
            binding: initScopeBinding(binding, info.type),
          };
      }
    });
  }
}

export class StructFields {
  private structFields: Scope<symbol, Case> = new Scope();
  init(
    name: string,
    fields: Array<{ fieldName: string; type: Type }>,
    isTuple: boolean
  ): Case {
    const type = TypeChecker.createValue(Symbol(name), [], []);
    const structCase = new Case(type, isTuple);
    for (const field of fields) {
      structCase.addConcreteField(field.fieldName, field.type);
    }
    this.structFields.init(type.name, structCase);
    return structCase;
  }
  get(type: Type): Case {
    return this.structFields.get(type.name);
  }
}

export class EnumFields {
  private enumFields: Scope<symbol, Scope<string, Case>> = new Scope();
  init(
    name: string,
    enumCases: Array<{
      tagName: string;
      fields: Array<{ fieldName: string; type: Type }>;
      isTuple: boolean;
    }>,
    traits: Trait[]
  ): { type: Type; casesMap: Scope<string, Case> } {
    const type = TypeChecker.createValue(Symbol(name), [], traits);
    const casesMap = new Scope<string, Case>();
    for (const [i, { fields, tagName, isTuple }] of enumCases.entries()) {
      const enumCase = new Case(type, isTuple, i);
      for (const field of fields) {
        enumCase.addConcreteField(field.fieldName, field.type);
      }
      casesMap.init(tagName, enumCase);
    }
    this.enumFields.init(type.name, casesMap);
    return { type, casesMap };
  }
  // get(type: Type, tagName: string, fieldName: string): FieldResult {
  //   return this.enumFields.get(type.name).get(tagName).getField(fieldName);
  // }
}
