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

const voidType: Type = { tag: "primitive", value: Symbol("void") };
const integerType: Type = { tag: "primitive", value: Symbol("integer") };
const floatType: Type = { tag: "primitive", value: Symbol("float") };
const stringType: Type = { tag: "primitive", value: Symbol("string") };
const boolType: Type = {
  tag: "enum",
  value: Symbol("Boolean"),
  parameters: [],
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

class VarScope {
  scope: Scope<string, Type> = new Scope();
  init(key: string, value: Type): void {
    this.scope.init(key, value);
  }
  get(key: string): Type {
    return this.scope.get(key);
  }
  withScope<T>(fn: (prevScope: Scope<string, Type>) => T): T {
    const prevScope = this.scope;
    this.scope = this.scope.push();
    const res = fn(prevScope);
    this.scope = this.scope.pop();
    return res;
  }
}

class TypeChecker {
  scope = new VarScope();
  private currentFunc = new CurrentFuncState();
  private types = new TypeScope(builtInTypes, builtInTypeConstructors);
  static check(program: Stmt[]): CheckedStmt[] {
    return new TypeChecker().checkBlock(program).block;
  }
  private withScope<T>(fn: (prevScope: Scope<string, Type>) => T): T {
    return this.scope.withScope((prevScope) =>
      this.types.withScope(() => fn(prevScope))
    );
  }
  private checkBlock(block: Stmt[]): { block: CheckedStmt[]; type: Type } {
    const checkedBlock: CheckedStmt[] = [];
    let type = voidType;
    this.withScope(() => {
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
    });

    return { block: checkedBlock, type };
  }
  private checkStmt(stmt: Stmt): CheckedStmt | null {
    switch (stmt.tag) {
      case "expr": {
        const expr = this.checkExpr(stmt.expr, null);
        return { tag: "expr", expr, hasValue: expr.type !== voidType };
      }
      case "type":
        this.types.alias(stmt.binding, stmt.type);
        return null;
      case "enum":
        this.types.enumType(stmt.binding, stmt.cases);
        return null;
      case "struct":
        this.types.structType(stmt.binding, stmt.fields);
        return null;
      case "let": {
        const forwardType = this.types.forwardType(stmt.type);
        const expr = this.checkExpr(stmt.expr, forwardType);
        this.types.unify(expr.type, forwardType);

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
        const type = this.types.func(
          stmt.typeParameters,
          stmt.parameters,
          stmt.returnType
        );
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
        const type = this.types.checkFunc(forwardType, expr.parameters);
        const rawParams = type.parameters.map((type, i) => ({
          type,
          binding: expr.parameters[i],
        }));

        return {
          tag: "closure",
          type,
          ...this.checkFunc(rawParams, type.returnType, expr.block),
        };
      }

      case "identifier": {
        const type = this.scope.get(expr.value);
        this.currentFunc.checkUpvalue(this.scope.scope, expr.value, type);

        return { tag: "identifier", value: expr.value, type };
      }
      case "typeConstructor": {
        const { value, type } = this.types.getConstructor(expr.value);
        switch (type.tag) {
          case "enum": {
            return this.types.withScope(() => {
              const fields = zipFields(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                type.cases.get(expr.value)!.fields,
                expr.fields,
                (typeField, exprField) => {
                  const checked = this.checkExpr(
                    exprField.expr,
                    typeField.type
                  );
                  this.types.unify(typeField.type, checked.type);
                  checked.type = this.types.unify(typeField.type, checked.type);
                  return checked;
                }
              );
              return {
                tag: "enum",
                index: value,
                fields,
                type: this.types.enumValue(type),
              };
            });
          }
          case "struct": {
            return this.types.withScope(() => {
              const fields = zipFields(
                type.fields,
                expr.fields,
                (typeField, exprField) => {
                  const checked = this.checkExpr(
                    exprField.expr,
                    typeField.type
                  );
                  checked.type = this.types.unify(typeField.type, checked.type);
                  return checked;
                }
              );

              return {
                tag: "struct",
                value: fields,
                type: this.types.structValue(type),
              };
            });
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
          const type = this.types.checkBuiltInCall(arg.type);
          const op = type === stringType ? Opcode.PrintStr : Opcode.PrintNum;

          return {
            tag: "callBuiltIn",
            opcode: op,
            args: [arg],
            type: voidType,
          };
        }

        const callee = this.checkExpr(expr.expr, null);
        const { parameters, returnType } = this.types.checkFunc(
          callee.type,
          expr.args
        );
        // create scope around call, so unified args can be reused in subsequent calls
        return this.types.withScope(() => {
          const args = expr.args.map((arg, i) => {
            const argType = parameters[i];
            const checkedArg = this.checkExpr(arg, argType);
            this.types.unify(checkedArg.type, argType);
            return checkedArg;
          });

          return {
            tag: "call",
            callee,
            args,
            type: this.types.callValue(returnType),
          };
        });
      }
      case "field": {
        const checkedExpr = this.checkExpr(expr.expr, null);
        const typeField = this.types.checkField(
          checkedExpr.type,
          expr.fieldName
        );

        return {
          tag: "field",
          index: typeField.index,
          expr: checkedExpr,
          type: typeField.type,
        };
      }
      case "do": {
        const { block, type } = this.checkBlock(expr.block);
        return { tag: "do", block, type };
      }
      case "if": {
        const resultType: Type = {
          tag: "var",
          value: Symbol("result"),
        };

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
          this.types.unify(resultType, checkedBlock.type);
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
        const resultType: Type = {
          tag: "var",
          value: Symbol("result"),
        };
        const predicate = this.checkExpr(expr.expr, null);
        const predicateType = this.types.checkEnum(predicate.type);

        const res: CheckedExpr = {
          tag: "match",
          expr: predicate,
          cases: new Map(),
          type: voidType,
        };

        for (const matchCase of expr.cases) {
          const tag = matchCase.binding.value;
          const typeCase = predicateType.cases.get(tag);
          if (!typeCase) throw new Error("unknown tag");
          if (res.cases.has(tag)) throw new Error("duplicate tag");

          const { bindings, blockRes } = this.withScope(() => {
            const bindings = zipFields(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              predicateType.cases.get(tag)!.fields,
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
            return { bindings, blockRes };
          });

          this.types.unify(resultType, blockRes.type);
          res.cases.set(tag, {
            index: typeCase.index,
            bindings,
            block: blockRes.block,
          });
        }

        if (res.cases.size !== predicateType.cases.size) {
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
          const typeField = this.types.checkField(type, bindingField.fieldName);
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
    const res = this.withScope((outerScope) => {
      return this.currentFunc.withFunc(returnType, outerScope, () => {
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
    });
    // save current context
    return res;
  }

  private checkNumber(type: Type) {
    if (type === integerType || type === floatType) {
      return type;
    }
    throw new Error("type mismatch");
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
