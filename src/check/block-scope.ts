import { Scope } from "../scope";
import { Binding } from "../ast";
import { noMatch } from "../utils";
import { BlockScope as IBlockScope, CheckedExpr, Stdlib, Type } from "./types";

export class BlockScope implements IBlockScope {
  private values = new Scope<string, { name: symbol; type: Type }>();
  private types = new Scope<string, Type>();
  constructor(stdlib: Stdlib) {
    for (const [name, { type }] of stdlib.types) {
      this.types.init(name, type);
    }
  }
  initValue(
    binding: Binding,
    type: Type
  ): { root: symbol; rest: Array<{ name: symbol; expr: CheckedExpr }> } {
    switch (binding.tag) {
      case "identifier": {
        const name = Symbol(binding.value);
        this.values.init(binding.value, { name, type });
        return { root: name, rest: [] };
      }
      case "struct":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(binding);
    }
  }
  getValue(name: string): { name: symbol; type: Type } {
    return this.values.get(name);
  }
  initType(name: string, value: Type): void {
    this.types.init(name, value);
  }
  getType(name: string): { type: Type } {
    return { type: this.types.get(name) };
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
