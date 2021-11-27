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
  intType,
  floatType,
  boolType,
  stringType,
  voidType,
  createVar,
  funcType,
  showTrait,
  listType,
} from "./types";
import { Scope } from "../scope";

const showT = createVar(Symbol("T"), [showTrait]);

export class BlockScope implements IBlockScope {
  public obj!: Obj;
  public func!: Func;
  private vars = new Scope<string, BoundType>().init(
    "print",
    funcType([showT], voidType)
  );
  private types = new Scope<string, BoundType>()
    .init("Int", intType)
    .init("Float", floatType)
    .init("String", stringType)
    .init("Bool", boolType)
    .init("Void", voidType)
    .init("List", listType);
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
        const fields = binding.fields.map((field) => {
          const { index, type: fieldType } = this.obj.getField(
            targetType,
            field.fieldName
          );
          const binding = this.initVar(field.binding, fieldType);
          return { fieldIndex: index, binding };
        });
        this.obj.checkTupleFields(targetType, fields);
        return { tag: "struct", fields };
      }
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
