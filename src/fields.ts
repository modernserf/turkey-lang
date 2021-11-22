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

type FieldInfo = { compileIndex: number; type: Type };

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
      type,
      compileIndex: this.size++,
    });
  }
  getField(name: string, target: Type): FieldResult {
    const info = this.fields.get(name);
    const checker = new TypeChecker();
    checker.unify(this.type, target);

    const type = checker.resolve(info.type);
    return { type, index: info.compileIndex };
  }
  construct(
    inFields: Array<{ fieldName: string; expr: Expr }>,
    checkExpr: (expr: Expr, type: Type | null) => CheckedExpr
  ): CheckedExpr {
    const checker = new TypeChecker();
    const map = new Scope<string, CheckedExpr>();
    for (const { fieldName, expr } of inFields) {
      const info = this.fields.get(fieldName);
      const checked = checkExpr(expr, info.type);
      checker.unify(checked.type, info.type);
      checked.type = checker.resolve(checked.type);
      map.init(fieldName, checked);
    }

    const matchTypes = this.type.matchTypes.map((matchType) => {
      return checker.resolve(matchType);
    });
    const type = { ...this.type, matchTypes };

    const outFields = Array.from(this.fields).map(([fieldName]) =>
      map.get(fieldName)
    );

    if (this.isEnum) {
      return { tag: "enum", type, fields: outFields, index: this.index };
    } else {
      return { tag: "struct", type, fields: outFields };
    }
  }
  destructure(
    bindings: StructFieldBinding[],
    target: Type,
    initScopeBinding: (binding: Binding, type: Type) => CheckedBinding
  ): CheckedStructFieldBinding[] {
    if (this.isTuple && this.fields.size !== bindings.length) {
      throw new Error("invalid tuple destructuring");
    }
    const checker = new TypeChecker();
    checker.unify(this.type, target);
    return bindings.map(({ fieldName, binding }) => {
      const info = this.fields.get(fieldName);
      const type = checker.resolve(info.type);
      return {
        fieldIndex: info.compileIndex,
        binding: initScopeBinding(binding, type),
      };
    });
  }
}

export class StructFields {
  private structFields: Scope<symbol, Case> = new Scope();
  initStruct(
    name: string,
    matchTypes: Type[],
    fields: Array<{ fieldName: string; type: Type }>,
    isTuple: boolean
  ): Case {
    const type = TypeChecker.createValue(Symbol(name), matchTypes, []);
    const structCase = new Case(type, isTuple);
    for (const field of fields) {
      structCase.addConcreteField(field.fieldName, field.type);
    }
    this.structFields.init(type.name, structCase);
    return structCase;
  }
  initEnum(
    name: string,
    matchTypes: Type[],
    enumCases: Array<{
      tagName: string;
      fields: Array<{ fieldName: string; type: Type }>;
      isTuple: boolean;
    }>,
    traits: Trait[]
  ): { type: Type; casesMap: Scope<string, Case> } {
    const type = TypeChecker.createValue(Symbol(name), matchTypes, traits);
    const casesMap = new Scope<string, Case>();
    for (const [i, { fields, tagName, isTuple }] of enumCases.entries()) {
      const enumCase = new Case(type, isTuple, i);
      for (const field of fields) {
        enumCase.addConcreteField(field.fieldName, field.type);
      }
      casesMap.init(tagName, enumCase);
    }
    return { type, casesMap };
  }
  get(type: Type): Case {
    return this.structFields.get(type.name);
  }
}
