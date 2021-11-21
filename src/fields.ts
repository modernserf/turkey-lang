import { Scope } from "./scope";
import { TypeChecker } from "./type-scope-4";
import {
  Binding,
  CheckedBinding,
  CheckedExpr,
  Expr,
  StructFieldBinding,
  Type,
  ValueType,
} from "./types";

type FieldInfo =
  | { tag: "concrete"; compileIndex: number; type: Type }
  | { tag: "parameterized"; compileIndex: number; paramIndex: number };

export class StructFields {
  private structFields: Scope<
    symbol,
    {
      type: ValueType;
      fields: Scope<string, FieldInfo>;
    }
  > = new Scope();
  init(
    name: string,
    fields: Array<{ fieldName: string; type: Type }>
  ): ValueType {
    const type = TypeChecker.createValue(Symbol(name), [], []);
    const fieldsMap = new Scope<string, FieldInfo>();
    for (const [i, field] of fields.entries()) {
      fieldsMap.init(field.fieldName, {
        tag: "concrete",
        type: field.type,
        compileIndex: i,
      });
    }
    this.structFields.init(type.name, { type, fields: fieldsMap });
    return type;
  }
  getField(type: Type, name: string): { type: Type; index: number } {
    const info = this.structFields.get(type.name).fields.get(name);
    switch (info.tag) {
      case "concrete":
        return { type: info.type, index: info.compileIndex };
      case "parameterized":
        throw new Error("todo");
    }
  }
  construct(
    type: ValueType,
    inFields: Array<{ fieldName: string; expr: Expr }>,
    checkExpr: (expr: Expr, type: Type | null) => CheckedExpr
  ): CheckedExpr {
    const { fields: expectedFields } = this.structFields.get(type.name);

    const checker = new TypeChecker();
    const map = new Scope<string, CheckedExpr>();
    for (const { fieldName, expr } of inFields) {
      const info = expectedFields.get(fieldName);
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

    const outFields = Array.from(expectedFields).map(([fieldName]) =>
      map.get(fieldName)
    );

    return { tag: "struct", type, fields: outFields };
  }
  destructure(
    type: Type,
    bindings: StructFieldBinding[],
    initScopeBinding: (binding: Binding, type: Type) => CheckedBinding
  ): CheckedBinding {
    // TODO: ensure that "tuple structs" have all fields destructured
    const { fields } = this.structFields.get(type.name);
    const outFields = bindings.map(({ fieldName, binding }) => {
      const info = fields.get(fieldName);
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

    return { tag: "struct", fields: outFields };
  }
}

export class EnumFields {
  private enumFields: Scope<symbol, Scope<string, Scope<string, FieldInfo>>> =
    new Scope();
  init(
    type: ValueType,
    enumCases: Array<{ tagName: string; fields: Array<{ fieldName: string }> }>
  ) {
    const casesMap = new Scope<string, Scope<string, FieldInfo>>();
    // let typeCounter = 0;
    for (const enumCase of enumCases) {
      const fieldsMap = new Scope<string, FieldInfo>();
      if (enumCase.fields.length) throw new Error("todo");
      // for (const [i, field] of enumCase.fields.entries()) {
      //   fieldsMap.init(field.fieldName, {
      //     typeIndex: typeCounter++,
      //     compileIndex: i,
      //   });
      // }
      casesMap.init(enumCase.tagName, fieldsMap);
    }
    this.enumFields.init(type.name, casesMap);
  }
  get(type: Type, tagName: string, fieldName: string): FieldInfo {
    return this.enumFields.get(type.name).get(tagName).get(fieldName);
  }
}
