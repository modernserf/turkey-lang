import { noMatch } from "../utils";
import { Binding } from "../types";
import {
  BlockScope as IBlockScope,
  Func,
  Obj,
  VarScope,
  BoundType,
  CheckedBinding,
  Type,
} from "./types";
import { Scope } from "../scope";

export class BlockScope implements IBlockScope {
  public obj!: Obj;
  public func!: Func;
  private vars = new Scope<string, BoundType>();
  private types = new Scope<string, BoundType>();
  constructor(
    vars: Array<[string, BoundType]>,
    types: Array<[string, BoundType]>
  ) {
    vars.forEach(([name, type]) => {
      this.vars.init(name, type);
    });
    types.forEach(([name, type]) => {
      this.types.init(name, type);
    });
  }

  inScope<T>(fn: (outerScope: VarScope) => T): T {
    this.vars = this.vars.push();
    this.types = this.types.push();
    const res = this.obj.inScope(() => fn(this.vars.pop()));
    this.vars = this.vars.pop();
    this.types = this.types.pop();
    return res;
  }
  getVar(name: string): BoundType {
    const type = this.vars.get(name);
    this.func.checkUpvalue(name, type, (outerScope) => {
      return this.vars.isUpvalue(name, outerScope);
    });
    return type;
  }
  getType(name: string): BoundType {
    return this.types.get(name);
  }
  initVar(binding: Binding, targetType: BoundType): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.vars.init(binding.value, targetType);
        return { tag: "identifier", value: binding.value };
      case "struct": {
        this.obj.checkTupleFields(targetType, binding.fields.length);
        const fields = binding.fields.map((field) => {
          const { index, type: fieldType } = this.obj.getField(
            targetType,
            field.fieldName
          );
          const binding = this.initVar(field.binding, fieldType);
          return { fieldIndex: index, binding };
        });
        return { tag: "struct", fields };
      }
      // istanbul ignore next
      default:
        return noMatch(binding);
    }
  }
  initTypeAlias(name: string, type: Type): void {
    if (type.tag === "var") {
      throw new Error("invalid type binding");
    }
    this.types.init(name, type);
  }
}
