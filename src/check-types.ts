import {
  Stmt,
  Expr,
  Type,
  CheckedStmt,
  CheckedExpr,
  Opcode,
  Binding,
  CheckedBinding,
  CheckedStructFieldBinding,
} from "./types";
import { Scope } from "./scope";
import { noMatch } from "./utils";
import { CurrentFuncState, FuncFields } from "./current-func";
import { TypeScope, TypeConstructor } from "./type-scope-2";

const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const stringType: Type = { tag: "string" };
const boolType: Type = {
  tag: "enum",
  value: Symbol("Boolean"),
  cases: new Map([
    ["False", { index: 0, fields: new Map() }],
    ["True", { index: 1, fields: new Map() }],
  ]),
};
const builtInTypes = new Scope<string, Type>()
  .set("Int", integerType)
  .set("Float", floatType)
  .set("Boolean", boolType)
  .set("String", stringType)
  .set("Void", voidType);

const builtInTypeConstructors = new Scope<string, TypeConstructor>()
  .set("False", { value: 0, type: boolType })
  .set("True", { value: 1, type: boolType });

export function check(program: Stmt[]): CheckedStmt[] {
  return TypeChecker.check(program);
}

class TypeChecker {
  private scope: Scope<string, Type> = new Scope();
  private currentFunc = new CurrentFuncState();
  private types = new TypeScope(builtInTypes, builtInTypeConstructors);
  static check(program: Stmt[]): CheckedStmt[] {
    return new TypeChecker().checkBlock(program).block;
  }
  private checkBlock(block: Stmt[]): { block: CheckedStmt[]; type: Type } {
    const checkedBlock: CheckedStmt[] = [];
    let type = voidType;
    this.scope = this.scope.push();
    for (const stmt of block) {
      const checkedStmt = this.checkStmt(stmt);
      if (!checkedStmt) {
        type = voidType;
        continue;
      }
      checkedBlock.push(checkedStmt);
      if (checkedStmt.tag === "expr") {
        type = checkedStmt.expr.type;
      } else {
        type = voidType;
      }
    }
    this.scope = this.scope.pop();
    return { block: checkedBlock, type };
  }
  private checkStmt(stmt: Stmt): CheckedStmt | null {
    switch (stmt.tag) {
      case "expr":
        return { tag: "expr", expr: this.checkExpr(stmt.expr, null) };
      case "type":
        this.types.alias(stmt.binding, stmt.type);
        return null;
      case "enum":
        this.types.enum(stmt.binding, stmt.cases);
        return null;
      case "struct":
        this.types.struct(stmt.binding, stmt.fields);
        return null;
      case "let": {
        const forwardType = stmt.type
          ? this.types.checkTypeExpr(stmt.type)
          : null;
        const expr = this.checkExpr(stmt.expr, forwardType);
        if (forwardType) {
          this.types.unify(expr.type, forwardType);
        }
        const binding = this.initScopeBinding(stmt.binding, expr.type);
        return { tag: "let", binding, expr };
      }
      case "while": {
        const checkedPredicate = this.checkExpr(stmt.expr, null);
        this.types.unify(boolType, checkedPredicate.type);
        const { block } = this.checkBlock(stmt.block);
        return { tag: "while", expr: checkedPredicate, block };
      }
      case "return": {
        const returnType = this.currentFunc.funcReturnType();
        if (!stmt.expr) {
          this.types.unify(voidType, returnType);
          return { tag: "return", expr: null };
        }
        const expr = this.checkExpr(stmt.expr, returnType);
        this.types.unify(returnType, expr.type);
        return { tag: "return", expr };
      }
      case "func": {
        const type = this.types.func(stmt.parameters, stmt.returnType);
        const rawParams = stmt.parameters.map(({ binding }, i) => ({
          binding,
          type: type.parameters[i],
        }));

        this.scope.init(stmt.name, type);

        return {
          tag: "func",
          name: stmt.name,
          type,
          ...this.checkFunc(rawParams, type.returnType, stmt.block),
        };
      }
    }
  }

  private checkExpr(expr: Expr, forwardType: Type | null): CheckedExpr {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, type: integerType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
      case "string":
        return { tag: "string", value: expr.value, type: stringType };
      case "closure": {
        if (!forwardType) throw new Error("missing type for closure");
        if (forwardType.tag !== "func") throw new Error("non-function type");
        if (forwardType.parameters.length !== expr.parameters.length) {
          throw new Error("arity mismatch");
        }
        const rawParams = forwardType.parameters.map((type, i) => ({
          type,
          binding: expr.parameters[i],
        }));

        return {
          tag: "closure",
          type: forwardType,
          ...this.checkFunc(rawParams, forwardType.returnType, expr.block),
        };
      }

      case "identifier": {
        const type = this.scope.get(expr.value);
        this.currentFunc.checkUpvalue(this.scope, expr.value, type);

        return { tag: "identifier", value: expr.value, type };
      }
      case "typeConstructor": {
        const { value, type } = this.types.getConstructor(expr.value);
        switch (type.tag) {
          case "enum": {
            const fields = zipFields(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              type.cases.get(expr.value)!.fields,
              expr.fields,
              (typeField, exprField) => {
                const checked = this.checkExpr(exprField.expr, typeField.type);
                this.types.unify(typeField.type, checked.type);
                return checked;
              }
            );
            return { tag: "enum", index: value, fields, type };
          }
          case "struct": {
            const fields = zipFields(
              type.fields,
              expr.fields,
              (typeField, exprField) => {
                const checked = this.checkExpr(exprField.expr, typeField.type);
                this.types.unify(typeField.type, checked.type);
                return checked;
              }
            );

            return { tag: "struct", value: fields, type };
          }
          // istanbul ignore next
          default:
            return noMatch(type);
        }
      }
      case "unaryOp": {
        const checked = this.checkExpr(expr.expr, null);
        switch (expr.operator) {
          case "!":
            return {
              tag: "callBuiltIn",
              opcode: Opcode.Not,
              args: [checked],
              type: this.types.unify(boolType, checked.type),
            };
          case "-":
            return {
              tag: "callBuiltIn",
              opcode: Opcode.Neg,
              args: [checked],
              type: this.checkNumber(checked.type),
            };
          // istanbul ignore next
          default:
            throw new Error(`unknown operator ${expr.operator}`);
        }
      }
      case "binaryOp": {
        switch (expr.operator) {
          case "+":
            return this.arithmeticOp(Opcode.Add, expr.left, expr.right);
          case "-":
            return this.arithmeticOp(Opcode.Sub, expr.left, expr.right);
          case "*":
            return this.arithmeticOp(Opcode.Mul, expr.left, expr.right);
          case "%":
            return this.arithmeticOp(Opcode.Mod, expr.left, expr.right);
          case "/":
            return this.arithmeticOp(
              Opcode.Div,
              expr.left,
              expr.right,
              floatType
            );
          case ">":
            return this.arithmeticOp(
              Opcode.Gt,
              expr.left,
              expr.right,
              boolType
            );
          case "==": {
            // TODO: equality of complex objects
            const left = this.checkExpr(expr.left, null);
            const right = this.checkExpr(expr.right, null);
            this.types.unify(left.type, right.type);

            return {
              tag: "callBuiltIn",
              opcode: Opcode.Eq,
              args: [left, right],
              type: boolType,
            };
          }

          // istanbul ignore next
          default:
            throw new Error(`unknown operator ${expr.operator}`);
        }
      }
      case "call": {
        if (expr.expr.tag === "identifier" && expr.expr.value === "print") {
          if (expr.args.length !== 1) throw new Error("arity mismatch");

          const arg = this.checkExpr(expr.args[0], null);
          const op =
            arg.type.tag === "string" ? Opcode.PrintStr : Opcode.PrintNum;

          return {
            tag: "callBuiltIn",
            opcode: op,
            args: [arg],
            type: voidType,
          };
        }

        const callee = this.checkExpr(expr.expr, null);
        if (callee.type.tag !== "func") {
          throw new Error("not callable");
        }
        if (callee.type.parameters.length !== expr.args.length) {
          throw new Error("arity mismatch");
        }
        const args: CheckedExpr[] = [];
        for (const [i, arg] of expr.args.entries()) {
          const argType = callee.type.parameters[i];
          const checkedArg = this.checkExpr(arg, argType);
          this.types.unify(checkedArg.type, argType);
          args.push(checkedArg);
        }
        return { tag: "call", callee, args, type: callee.type.returnType };
      }
      case "field": {
        const checkedExpr = this.checkExpr(expr.expr, null);
        switch (checkedExpr.type.tag) {
          case "struct": {
            const typeField = getField(checkedExpr.type, expr.fieldName);

            return {
              tag: "field",
              index: typeField.index,
              expr: checkedExpr,
              type: typeField.type,
            };
          }
          default:
            throw new Error("value does not have irrefutable fields");
        }
      }
      case "do": {
        const { block, type } = this.checkBlock(expr.block);
        return { tag: "do", block, type };
      }
      case "if": {
        let resultType: Type | null = null;

        const res: CheckedExpr = {
          tag: "if",
          cases: [],
          elseBlock: [],
          type: voidType,
        };

        for (const { predicate, block } of expr.cases) {
          const checkedPredicate = this.checkExpr(predicate, null);
          this.types.unify(boolType, checkedPredicate.type);
          const checkedBlock = this.checkBlock(block);
          resultType = this.types.unify(resultType, checkedBlock.type);
          res.cases.push({
            predicate: checkedPredicate,
            block: checkedBlock.block,
          });
        }

        const checkedElse = this.checkBlock(expr.elseBlock);
        res.elseBlock = checkedElse.block;
        res.type = this.types.unify(resultType, checkedElse.type);

        return res;
      }
      case "match": {
        let resultType: Type | null = null;
        const predicate = this.checkExpr(expr.expr, null);
        if (predicate.type.tag !== "enum") {
          throw new Error("can only pattern match with enums");
        }

        const res: CheckedExpr = {
          tag: "match",
          expr: predicate,
          cases: new Map(),
          type: voidType,
        };

        for (const matchCase of expr.cases) {
          // TODO: actually use bindings and not just tag
          const tag = matchCase.binding.value;
          const typeCase = predicate.type.cases.get(tag);

          if (!typeCase) {
            throw new Error("unknown tag");
          }
          if (res.cases.has(tag)) {
            throw new Error("duplicate tag");
          }

          this.scope = this.scope.push();
          const bindings = zipFields(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            predicate.type.cases.get(tag)!.fields,
            matchCase.binding.fields,
            (typeField, bindingField, i) => ({
              binding: this.initScopeBinding(
                bindingField.binding,
                typeField.type
              ),
              fieldIndex: i + 1, // +1 because tag takes up slot 0
            })
          );

          const blockRes = this.checkBlock(matchCase.block);
          this.scope = this.scope.pop();

          resultType = this.types.unify(resultType, blockRes.type);
          res.cases.set(tag, {
            index: typeCase.index,
            bindings,
            block: blockRes.block,
          });
        }
        // istanbul ignore next
        if (!resultType) {
          throw new Error("invalid match");
        }

        if (res.cases.size !== predicate.type.cases.size) {
          throw new Error("incomplete match");
        }

        res.type = resultType;
        return res;
      }
    }
  }

  private initScopeBinding(binding: Binding, type: Type): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.scope.init(binding.value, type);
        return binding;
      case "struct": {
        const fields: CheckedStructFieldBinding[] = [];
        for (const bindingField of binding.fields) {
          const typeField = getField(type, bindingField.fieldName);
          const checkedField = this.initScopeBinding(
            bindingField.binding,
            typeField.type
          );
          fields.push({ fieldIndex: typeField.index, binding: checkedField });
        }

        return { tag: "struct", fields };
      }
      // istanbul ignore next
      default:
        noMatch(binding);
    }
  }

  private checkFunc(
    parameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    rawBlock: Stmt[]
  ): FuncFields {
    // save current context
    const outerScope = this.scope;
    this.scope = this.scope.push();

    const res = this.currentFunc.withFunc(returnType, outerScope, () => {
      // add parameters to scope
      const checkedParams = parameters.map((param) => ({
        type: param.type,
        binding: this.initScopeBinding(param.binding, param.type),
      }));

      // check function body
      const { block } = this.checkBlock(rawBlock);

      // handle implicit returns
      const lastStmt = block.pop() ?? { tag: "noop" };
      switch (lastStmt.tag) {
        case "return":
          block.push(lastStmt);
          break;
        case "expr":
          this.types.unify(returnType, lastStmt.expr.type);
          block.push({ tag: "return", expr: lastStmt.expr });
          break;
        case "noop":
          this.types.unify(returnType, voidType);
          block.push({ tag: "return", expr: null });
          break;
        default:
          this.types.unify(returnType, voidType);
          block.push(lastStmt);
          block.push({ tag: "return", expr: null });
          break;
      }

      return { parameters: checkedParams, block };
    });

    this.scope = this.scope.pop();
    return res;
  }

  private checkNumber(type: Type) {
    if (type.tag !== "float" && type.tag !== "integer") {
      throw new Error("type mismatch");
    }
    return type;
  }

  private arithmeticOp(
    opcode: Opcode,
    left: Expr,
    right: Expr,
    outType?: Type
  ): CheckedExpr {
    const checkedLeft = this.checkExpr(left, null);
    const checkedRight = this.checkExpr(right, null);
    const type = this.checkNumber(
      this.types.unify(checkedLeft.type, checkedRight.type)
    );
    return {
      tag: "callBuiltIn",
      opcode,
      args: [checkedLeft, checkedRight],
      type: outType ?? type,
    };
  }
}

function getField(type: Type, fieldName: string) {
  if (type.tag !== "struct") {
    throw new Error("can only destructure structs");
  }
  const typeField = type.fields.get(fieldName);
  if (!typeField) throw new Error("invalid field");
  return typeField;
}
function zipFields<TypeField, ValueField extends { fieldName: string }, U>(
  typeFields: Map<string, TypeField>,
  valueFields: ValueField[],
  join: (t: TypeField, u: ValueField, i: number) => U
): U[] {
  const valueFieldsMap = new Map<string, ValueField>();
  for (const field of valueFields) {
    if (!typeFields.has(field.fieldName)) {
      throw new Error("unknown field");
    }
    if (valueFieldsMap.has(field.fieldName)) {
      throw new Error("duplicate field");
    }
    valueFieldsMap.set(field.fieldName, field);
  }

  return Array.from(typeFields.entries()).map(([fieldName, typeField], i) => {
    const valueField = valueFieldsMap.get(fieldName);
    if (!valueField) throw new Error("missing field");
    return join(typeField, valueField, i);
  });
}
