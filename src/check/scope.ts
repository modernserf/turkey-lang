import { Binding } from "../ast";
import { noMatch } from "../utils";
import {
  CheckedExpr,
  Stdlib,
  Type,
  Scope as IScope,
  CheckedStmt,
  voidType,
} from "./types";
import { StrictMap } from "../strict-map";

type CheckType = (value: Type) => void;

type ValueRecord = { name: symbol; type: Type };
type ScopeFrameBase =
  | { tag: "root" }
  | { tag: "block"; parent: ScopeFrame }
  | { tag: "loop"; parent: ScopeFrame; id: symbol }
  | {
      tag: "func";
      parent: ScopeFrame;
      upvalues: Set<symbol>;
      checkReturns: CheckType;
    };

type ScopeFrame = ScopeFrameBase & {
  values: StrictMap<string, ValueRecord>;
  types: StrictMap<string, Type>;
};

function getValue(
  frame: ScopeFrame,
  key: string,
  upvalues: Set<symbol> | null
): ValueRecord {
  switch (frame.tag) {
    case "root": {
      const res = frame.values.get(key);
      upvalues?.add(res.name);
      return res;
    }
    case "func": {
      if (frame.values.has(key)) {
        const res = frame.values.get(key);
        upvalues?.add(res.name);
        return res;
      } else {
        return getValue(frame.parent, key, upvalues || frame.upvalues);
      }
    }
    case "loop":
    case "block": {
      if (frame.values.has(key)) {
        const res = frame.values.get(key);
        upvalues?.add(res.name);
        return res;
      } else {
        return getValue(frame.parent, key, upvalues);
      }
    }
  }
}

export class Scope implements IScope {
  private frame: ScopeFrame = {
    tag: "root",
    values: new StrictMap(),
    types: new StrictMap(),
  };
  constructor(stdlib: Stdlib) {
    for (const [name, { type }] of stdlib.types) {
      this.initType(name, type);
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
  ): { root: symbol; rest: Array<{ name: symbol; expr: CheckedExpr }> } {
    switch (binding.tag) {
      case "identifier": {
        const name = Symbol(binding.value);
        this.frame.values.init(binding.value, { name, type });
        return { root: name, rest: [] };
      }
      case "struct":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(binding);
    }
  }
  getValue(str: string): CheckedExpr {
    const res = getValue(this.frame, str, null);
    return { tag: "ident", value: res.name, type: res.type };
  }
  initType(name: string, value: Type): void {
    this.frame.types.init(name, value);
  }
  getType(name: string): { type: Type } {
    let frame = this.frame;
    while (true) {
      switch (frame.tag) {
        case "root": {
          return { type: frame.types.get(name) };
        }
        case "block":
        case "func":
        case "loop":
          if (frame.types.has(name)) {
            return { type: frame.types.get(name) };
          } else {
            frame = frame.parent;
          }
      }
    }
  }
  blockScope<T>(fn: () => T): T {
    this.frame = {
      tag: "block",
      values: new StrictMap(),
      types: new StrictMap(),
      parent: this.frame,
    };
    const res = fn();
    this.frame = this.frame.parent;
    return res;
  }
  loopScope<T>(id: symbol, fn: () => T): T {
    this.frame = {
      tag: "loop",
      id,
      values: new StrictMap(),
      types: new StrictMap(),
      parent: this.frame,
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
      values: new StrictMap(),
      types: new StrictMap(),
      parent: this.frame,
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
}