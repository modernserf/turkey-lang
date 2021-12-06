import { Binding, TypeExpr } from "../ast";
import { noMatch } from "../utils";
import {
  CheckedExpr,
  Stdlib,
  Type,
  Scope as IScope,
  CheckedStmt,
  voidType,
  TypeConstructor,
  tupleType,
  funcType,
  Obj,
} from "./types";
import { StrictMap } from "../strict-map";
import { CheckerProvider } from "./checker";

type CheckType = (value: Type) => void;

type ValueRecord = { name: symbol; type: Type };
type TypeRecord =
  | { tag: "simple"; value: Type }
  | { tag: "alias"; params: Type[]; type: Type }
  | { tag: "array"; value: Type };

type ScopeFrameValue = {
  values: StrictMap<string, ValueRecord>;
  types: StrictMap<string, TypeRecord>;
  typeConstructors: StrictMap<string, TypeConstructor>;
};

type ScopeFrame<T = ScopeFrameValue> =
  | ({ tag: "root" } & T)
  | ({ tag: "block"; parent: ScopeFrame<T> } & T)
  | ({ tag: "loop"; parent: ScopeFrame<T>; id: symbol } & T)
  | ({
      tag: "func";
      parent: ScopeFrame<T>;
      upvalues: Set<symbol>;
      checkReturns: CheckType;
    } & T);

function getValue(frame: ScopeFrame, key: string): CheckedExpr {
  switch (frame.tag) {
    case "root": {
      const res = frame.values.get(key);
      return { tag: "rootVar", value: res.name, type: res.type };
    }
    case "func":
      if (frame.values.has(key)) {
        const res = frame.values.get(key);
        return { tag: "local", value: res.name, type: res.type };
      } else {
        const res = getValue(frame.parent, key);
        if (res.tag === "local") {
          frame.upvalues.add(res.value);
        }
        return res;
      }
    case "block":
    case "loop":
      if (frame.values.has(key)) {
        const res = frame.values.get(key);
        return { tag: "local", value: res.name, type: res.type };
      } else {
        return getValue(frame.parent, key);
      }
  }
}

export class Scope implements IScope {
  private frame: ScopeFrame = {
    tag: "root",
    ...this.newFrameValue(),
  };
  constructor(
    stdlib: Stdlib,
    private checker: CheckerProvider,
    private obj: Obj
  ) {
    for (const [name, { type, constructors }] of stdlib.types) {
      // FIXME maybe
      if (name === "Array") {
        this.initArrayType(name, type);
      } else {
        this.initType(name, type);
      }
      if (constructors) {
        if (constructors.length) {
          this.initEnumConstructors(constructors, type);
        } else {
          this.initStructConstructor(name, type);
        }
      }
    }
  }
  break(): CheckedStmt {
    throw new Error("todo");
  }
  continue(): CheckedStmt {
    throw new Error("todo");
  }
  return(expr: CheckedExpr | null): CheckedStmt {
    const func = this.func();
    if (!func) throw new Error("cannot return from outside func");
    if (expr) {
      func.checkReturns(expr.type);
    } else {
      func.checkReturns(voidType);
    }
    return { tag: "return", expr };
  }
  initValue(
    binding: Binding,
    type: Type
  ): { root: symbol; rest: CheckedStmt[] } {
    switch (binding.tag) {
      case "identifier": {
        const name = Symbol(binding.value);
        if (!binding.value.startsWith("_")) {
          this.frame.values.init(binding.value, { name, type });
        }
        return { root: name, rest: [] };
      }
      case "record": {
        const root = Symbol("root");
        const rootExpr: CheckedExpr = { tag: "local", value: root, type };
        const rest = binding.fields.flatMap((f) => {
          const field = this.obj.getField(rootExpr, f.fieldName);
          const res = this.initValue(f.binding, field.type);
          return [
            { tag: "let" as const, binding: res.root, expr: field },
            ...res.rest,
          ];
        });
        return { root, rest };
      }
      case "tuple":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(binding);
    }
  }
  getValue(str: string): CheckedExpr {
    if (str.startsWith("_")) {
      throw new Error("cannot reference underscore variables");
    }
    return getValue(this.frame, str);
  }
  initType(name: string, value: Type): void {
    this.frame.types.init(name, { tag: "simple", value });
  }
  initTypeAlias(name: string, params: Type[], type: Type): void {
    this.frame.types.init(name, { tag: "alias", params, type });
  }
  initArrayType(name: string, value: Type) {
    this.frame.types.init(name, { tag: "array", value });
  }
  getType(typeExpr: TypeExpr, typeParams?: StrictMap<string, Type>): Type {
    switch (typeExpr.tag) {
      case "identifier":
        return this.getNamedType(typeExpr.value, typeExpr.typeArgs, typeParams);
      case "tuple":
        return tupleType(
          typeExpr.typeArgs.map((arg) => this.getType(arg, typeParams))
        );
      case "func":
        return funcType(
          this.getType(typeExpr.returnType, typeParams),
          typeExpr.parameters.map((p) => this.getType(p, typeParams)),
          [] // TODO: something with type params here?
        );
      case "array": {
        const record = this.getTypeRecord(typeExpr.value);
        if (record.tag === "array") {
          if (record.value.tag === "abstract") throw new Error("todo");
          const param = this.getType(typeExpr.type, typeParams);
          return {
            ...record.value,
            parameters: [param],
            arraySize: typeExpr.size,
          };
        } else {
          throw new Error("expected array type");
        }
      }
      // istanbul ignore next
      default:
        noMatch(typeExpr);
    }
  }
  private getTypeRecord(name: string): TypeRecord {
    let frame = this.frame;
    while (frame.tag !== "root") {
      if (frame.types.has(name)) {
        return frame.types.get(name);
      } else {
        frame = frame.parent;
      }
    }
    return frame.types.get(name);
  }
  private getNamedType(
    name: string,
    typeArgs: TypeExpr[],
    typeParams?: StrictMap<string, Type>
  ): Type {
    const args = typeArgs.map((arg) => this.getType(arg, typeParams));

    if (typeParams) {
      if (args.length) throw new Error("can't param a param");
      if (typeParams.has(name)) return typeParams.get(name);
    }

    const record = this.getTypeRecord(name);
    switch (record.tag) {
      case "simple": {
        const baseType = record.value;
        if (baseType.tag === "abstract") throw new Error("todo");
        if (args.length !== baseType.parameters.length) {
          throw new Error("param mismatch");
        }
        return { ...baseType, parameters: args };
      }
      case "alias": {
        if (args.length !== record.params.length) {
          throw new Error("arity mismatch");
        }
        const checker = this.checker.create();
        record.params.forEach((p, i) => checker.unify(p, args[i]));
        return checker.resolve(record.type);
      }
      case "array":
        throw new Error("Array type missing length");
      // istanbul ignore next
      default:
        noMatch(record);
    }
  }
  initStructConstructor(name: string, type: Type) {
    this.frame.typeConstructors.init(name, { tag: "struct", type });
  }
  initEnumConstructors(names: string[], type: Type) {
    names.forEach((name, tagValue) => {
      this.frame.typeConstructors.init(name, { tag: "enum", type, tagValue });
    });
  }
  getConstructor(name: string): TypeConstructor {
    let frame = this.frame;
    while (frame.tag !== "root") {
      if (frame.typeConstructors.has(name)) {
        return frame.typeConstructors.get(name);
      } else {
        frame = frame.parent;
      }
    }
    return frame.typeConstructors.get(name);
  }
  blockScope<T>(fn: () => T): T {
    this.frame = {
      tag: "block",
      parent: this.frame,
      ...this.newFrameValue(),
    };
    const res = fn();
    this.frame = this.frame.parent;
    return res;
  }
  loopScope<T>(id: symbol, fn: () => T): T {
    this.frame = {
      tag: "loop",
      id,
      parent: this.frame,
      ...this.newFrameValue(),
    };
    const res = fn();
    this.frame = this.frame.parent;
    return res;
  }
  funcScope<T>(
    checkReturns: CheckType,
    fn: () => T
  ): { upvalues: symbol[]; result: T } {
    this.frame = {
      tag: "func",
      checkReturns,
      upvalues: new Set(),
      parent: this.frame,
      ...this.newFrameValue(),
    };
    const result = fn();
    const { upvalues } = this.frame;
    this.frame = this.frame.parent;
    return { upvalues: Array.from(upvalues), result };
  }
  private func(): (ScopeFrame & { tag: "func" }) | null {
    let frame = this.frame;
    while (frame.tag !== "root") {
      if (frame.tag === "func") return frame;
      frame = frame.parent;
    }
    return null;
  }
  private newFrameValue(): ScopeFrameValue {
    return {
      values: new StrictMap(),
      types: new StrictMap(),
      typeConstructors: new StrictMap(),
    };
  }
}
