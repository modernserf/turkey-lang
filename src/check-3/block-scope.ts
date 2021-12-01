import { Scope } from "../scope";
import { Binding } from "../types";
import { noMatch } from "../utils";
import {
  BlockScope as IBlockScope,
  CheckedExpr,
  ExprAttrs,
  Stdlib,
} from "./types";

export class BlockScope implements IBlockScope {
  private values = new Scope<string, { name: symbol; attrs: ExprAttrs }>();
  private types = new Scope<string, ExprAttrs>();
  constructor(stdlib: Stdlib) {
    for (const [name, value] of stdlib.types) {
      this.types.init(name, value);
    }
  }
  initValue(
    binding: Binding,
    attrs: ExprAttrs
  ): { root: symbol; rest: Array<{ name: symbol; expr: CheckedExpr }> } {
    switch (binding.tag) {
      case "identifier": {
        const name = Symbol(binding.value);
        this.values.init(binding.value, { name, attrs });
        return { root: name, rest: [] };
      }
      case "struct":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(binding);
    }
  }
  getValue(name: string): { name: symbol; attrs: ExprAttrs } {
    return this.values.get(name);
  }
  initType(name: string, value: ExprAttrs): void {
    this.types.init(name, value);
  }
  getType(name: string): { attrs: ExprAttrs } {
    return { attrs: this.types.get(name) };
  }
  inScope<T>(fn: () => T): T {
    this.values = this.values.push();
    this.types = this.types.push();
    try {
      return fn();
    } finally {
      this.values = this.values.pop();
      this.types = this.types.pop();
    }
  }
}
