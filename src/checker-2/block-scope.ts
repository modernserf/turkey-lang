import { Scope, ValueWithSource } from "../scope";
import { BoundType, ExprAttrs, StdLib, Type, TypeVar } from "./types";

export class BlockScope {
  private values: Scope<string, ExprAttrs> = new Scope();
  private types: Scope<string, BoundType> = new Scope();
  constructor(stdlib: StdLib) {
    stdlib.values.forEach(({ name, attrs }) => {
      this.values.init(name, attrs);
    });
  }
  getValue(name: string): ValueWithSource<ExprAttrs> {
    return this.values.getWithSource(name);
  }
  initValue(name: string, value: ExprAttrs): void {
    this.values.set(name, value);
  }
  getType(name: string, typeVars: Map<string, TypeVar>): Type {
    const found = typeVars.get(name);
    if (found) return found;
    return this.types.get(name);
  }
  inScope<T>(cb: () => T): T {
    this.values = this.values.push();
    this.types = this.types.push();
    const res = cb();
    this.types = this.types.pop();
    this.values = this.values.pop();
    return res;
  }
}
