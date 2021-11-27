import {
  Binding,
  EnumCase,
  Expr,
  StructFieldType,
  StructFieldValue,
} from "../types";
import {
  Obj as IObj,
  BoundType,
  CheckedExpr,
  CheckedStructFieldBinding,
  Match,
  TreeWalker,
  tupleTypeName,
  tupleType,
} from "./types";

export class Obj implements IObj {
  public treeWalker!: TreeWalker;
  createTuple(
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): CheckedExpr {
    const hints = this.tupleFieldHints(typeHint, fields.length);
    const checkedFields = fields.map((field, i) =>
      this.treeWalker.expr(field.expr, hints[i])
    );
    const type = tupleType(checkedFields.map((field) => field.type));
    return { tag: "object", fields: checkedFields, type };
  }
  checkTupleFields(
    targetType: BoundType,
    fields: CheckedStructFieldBinding[]
  ): void {
    if (targetType.name === tupleTypeName) {
      if (fields.length === targetType.parameters.length) return;
      throw new Error("Incomplete tuple destructuring");
    }
    throw new Error("todo");
  }
  getField(
    target: BoundType,
    fieldName: string
  ): { type: BoundType; index: number } {
    if (target.name === tupleTypeName) {
      const index = Number(fieldName);
      const type = target.parameters[index];
      if (!type || type.tag === "var") {
        throw new Error("invalid field");
      }
      return { index, type };
    }
    throw new Error("todo");
  }
  createList(_values: Expr[], _typeHint: BoundType | null): CheckedExpr {
    throw new Error("todo");
  }
  createTagged(
    _tag: string,
    _fields: StructFieldValue[],
    _typeHint: BoundType | null
  ): CheckedExpr {
    throw new Error("todo");
  }

  checkMatchTarget(_type: BoundType): Match {
    throw new Error("todo");
  }
  getIterator(_target: Expr): { target: CheckedExpr; iter: BoundType } {
    throw new Error("todo");
  }
  declareStruct(
    _binding: Binding,
    _fields: StructFieldType[],
    _isTuple: boolean
  ): void {
    throw new Error("todo");
  }
  declareEnum(_binding: Binding, _cases: EnumCase[]): void {
    throw new Error("todo");
  }
  private tupleFieldHints(
    typeHint: BoundType | null,
    expectedSize: number
  ): Array<BoundType | null> {
    if (
      typeHint &&
      (typeHint.name !== tupleTypeName ||
        typeHint.parameters.length !== expectedSize)
    ) {
      throw new Error("Invalid type hint");
    }
    return Array(expectedSize)
      .fill(0)
      .map((_, i) => {
        if (!typeHint) return null;
        const param = typeHint.parameters[i];
        if (param.tag === "var") return null;
        return param;
      });
  }
}
