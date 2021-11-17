import { Scope } from "./scope";
import { Type } from "./types";

export type TypeWithVar =
  | { tag: "var"; value: symbol }
  | { tag: "integer" }
  | { tag: "float" }
  | {
      tag: "struct";
      value: symbol;
      parameters: TypeWithVar[];
      fields: Map<string, TypeWithVar>;
    };

export class TypeScope {
  private boundVars = new Scope<symbol, TypeWithVar>();
  inScope<T>(fn: () => T): T {
    this.boundVars = this.boundVars.push();
    const res = fn();
    this.boundVars = this.boundVars.pop();
    return res;
  }
  var(label?: string): TypeWithVar {
    return { tag: "var", value: Symbol(label) };
  }
  unify(left: TypeWithVar, right: TypeWithVar): TypeWithVar {
    switch (left.tag) {
      case "var": {
        if (right.tag === "var") {
          if (left.value === right.value) return left;
          if (this.boundVars.has(right.value)) {
            return this.unify(left, this.boundVars.get(right.value));
          }
        }

        if (this.boundVars.has(left.value)) {
          return this.unify(this.boundVars.get(left.value), right);
        }
        this.boundVars.set(left.value, right);
        return right;
      }
      case "integer":
      case "float": {
        if (right.tag === "var") return this.unify(right, left);
        if (left.tag !== right.tag) throw new Error();
        return left;
      }
      case "struct": {
        if (right.tag !== "struct") throw new Error();
        // istanbul ignore next
        if (left.parameters.length !== right.parameters.length)
          throw new Error();
        const parameters = left.parameters.map((param, i) => {
          return this.unify(param, right.parameters[i]);
        });

        return {
          tag: "struct",
          value: left.value,
          parameters,
          fields: left.fields,
        };
      }
    }
  }
  resolve(type: TypeWithVar): Type {
    switch (type.tag) {
      case "var": {
        if (this.boundVars.has(type.value)) {
          return this.resolve(this.boundVars.get(type.value));
        }
        throw new Error();
      }
      case "float":
      case "integer":
        return type;
      case "struct":
        return {
          tag: "struct",
          value: type.value,
          fields: new Map(
            Array.from(type.fields).map(([key, type], index) => {
              return [key, { index, type: this.resolve(type) }];
            })
          ),
        };
    }
  }
}
