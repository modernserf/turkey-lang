import {
  Stmt,
  Expr,
  TypeExpr,
  Type,
  CheckedStmt,
  CheckedExpr,
  Opcode,
  Binding,
} from "./types";
import { Scope } from "./scope";

const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const stringType: Type = { tag: "string" };
const boolType: Type = { tag: "enum", value: Symbol("Boolean") };
const builtInTypes = new Scope<string, Type>()
  .set("Int", integerType)
  .set("Float", floatType)
  .set("Boolean", boolType)
  .set("String", stringType)
  .set("Void", voidType);

type TypeConstructor = { value: number; type: Type };
const builtInTypeConstructors = new Scope<string, TypeConstructor>()
  .set("False", { value: 0, type: boolType })
  .set("True", { value: 1, type: boolType });

type CurrentFunc = {
  returnType: Type;
  upvalues: Map<string, Type>;
  outerScope: Scope<string, Type>;
};

export function check(program: Stmt[]): CheckedStmt[] {
  return TypeChecker.check(program);
}

class TypeChecker {
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, TypeConstructor>;
  private scope: Scope<string, Type> = new Scope();
  private currentFunc: CurrentFunc | null = null;
  static check(program: Stmt[]): CheckedStmt[] {
    return new TypeChecker().checkBlock(program).block;
  }
  constructor() {
    this.types = builtInTypes.push();
    this.typeConstructors = builtInTypeConstructors.push();
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
        this.types.init(stmt.binding.value, this.checkTypeExpr(stmt.type));
        return null;
      case "enum": {
        const type: Type = { tag: "enum", value: Symbol(stmt.binding.value) };
        this.types.init(stmt.binding.value, type);
        for (const [i, enumCase] of stmt.cases.entries()) {
          this.typeConstructors.init(enumCase.tagName, { type, value: i });
        }
        return null;
      }
      case "struct": {
        const type: Type = {
          tag: "struct",
          value: Symbol(stmt.binding.value),
          fields: [],
        };
        const fieldNames = new Set();
        this.types.init(stmt.binding.value, type);
        for (const field of stmt.fields) {
          if (fieldNames.has(field.fieldName)) {
            throw new Error("duplicate field");
          }
          fieldNames.add(field.fieldName);
          type.fields.push({
            fieldName: field.fieldName,
            type: this.checkTypeExpr(field.type),
          });
        }
        this.typeConstructors.init(stmt.binding.value, { type, value: 0 });
        return null;
      }
      case "let": {
        const forwardType = stmt.type ? this.checkTypeExpr(stmt.type) : null;
        const expr = this.checkExpr(stmt.expr, forwardType);
        if (forwardType) {
          this.unify(expr.type, forwardType);
        }
        this.scope.init(stmt.binding.value, expr.type);
        return { tag: "let", binding: stmt.binding, expr };
      }
      case "while": {
        const checkedPredicate = this.checkExpr(stmt.expr, null);
        this.unify(boolType, checkedPredicate.type);
        const { block } = this.checkBlock(stmt.block);
        return { tag: "while", expr: checkedPredicate, block };
      }
      case "return": {
        if (!this.currentFunc) {
          throw new Error("cannot return from top level");
        }
        if (!stmt.expr) {
          this.unify(voidType, this.currentFunc.returnType);
          return { tag: "return", expr: null };
        }
        const expr = this.checkExpr(stmt.expr, this.currentFunc.returnType);
        this.unify(this.currentFunc.returnType, expr.type);
        return { tag: "return", expr };
      }
      case "func": {
        const parameters = stmt.parameters.map(({ binding, type }) => ({
          binding,
          type: this.checkTypeExpr(type),
        }));
        const returnType = this.checkTypeExpr(stmt.returnType);
        const type: Type = {
          tag: "func",
          parameters: parameters.map((p) => p.type),
          returnType,
        };
        this.scope.init(stmt.name, type);

        const { upvalues, block } = this.checkFunc(
          parameters,
          returnType,
          stmt.block
        );

        return {
          tag: "func",
          name: stmt.name,
          parameters,
          upvalues,
          type,
          block,
        };
      }
    }
  }
  private checkFunc(
    parameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    rawBlock: Stmt[]
  ): {
    upvalues: Array<{ name: string; type: Type }>;
    block: CheckedStmt[];
  } {
    // save current context
    const outerScope = this.scope;
    this.scope = this.scope.push();
    const prevCurrentFunc = this.currentFunc;
    this.currentFunc = { returnType, upvalues: new Map(), outerScope };

    // add parameters to scope
    for (const param of parameters) {
      this.scope.init(param.binding.value, param.type);
    }

    // check function body
    const { block } = this.checkBlock(rawBlock);

    // handle implicit returns
    const lastStmt = block.pop() ?? { tag: "noop" };
    switch (lastStmt.tag) {
      case "return":
        block.push(lastStmt);
        break;
      case "expr":
        this.unify(returnType, lastStmt.expr.type);
        block.push({ tag: "return", expr: lastStmt.expr });
        break;
      case "noop":
        this.unify(returnType, voidType);
        block.push({ tag: "return", expr: null });
        break;
      // istanbul ignore next
      default:
        this.unify(returnType, voidType);
        block.push(lastStmt);
        block.push({ tag: "return", expr: null });
        break;
    }

    const upvalues = Array.from(this.currentFunc.upvalues.entries()).map(
      ([name, type]) => ({ name, type })
    );

    this.currentFunc = prevCurrentFunc;
    this.scope = this.scope.pop();
    // propagate upvalues
    if (prevCurrentFunc) {
      for (const upval of upvalues) {
        if (this.scope.isUpvalue(upval.name, prevCurrentFunc.outerScope)) {
          prevCurrentFunc.upvalues.set(upval.name, upval.type);
        }
      }
    }

    return { upvalues, block };
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
        const parameters = forwardType.parameters.map((type, i) => ({
          type,
          binding: expr.parameters[i],
        }));

        const { upvalues, block } = this.checkFunc(
          parameters,
          forwardType.returnType,
          expr.block
        );
        return {
          tag: "closure",
          type: forwardType,
          parameters,
          upvalues,
          block,
        };
      }

      case "identifier": {
        const type = this.scope.get(expr.value);

        if (this.currentFunc) {
          if (this.scope.isUpvalue(expr.value, this.currentFunc.outerScope)) {
            this.currentFunc.upvalues.set(expr.value, type);
          }
        }

        return { tag: "identifier", value: expr.value, type };
      }
      case "typeConstructor": {
        const { value, type } = this.typeConstructors.get(expr.value);
        switch (type.tag) {
          case "enum":
            if (expr.fields.length > 0) throw new Error("not yet implemented");
            return { tag: "primitive", value, type };
          case "struct": {
            if (expr.fields.length !== type.fields.length) {
              throw new Error("arity mismatch");
            }
            const exprFieldsMap = new Map<string, Expr>();
            for (const field of expr.fields) {
              if (exprFieldsMap.has(field.fieldName)) {
                throw new Error("duplicate field");
              }
              exprFieldsMap.set(field.fieldName, field.expr);
            }

            const value: CheckedExpr[] = [];
            for (const field of type.fields) {
              const res = exprFieldsMap.get(field.fieldName);
              if (!res) throw new Error("missing field");
              const checked = this.checkExpr(res, field.type);
              this.unify(field.type, checked.type);
              value.push(checked);
            }

            return { tag: "struct", value, type };
          }
          default:
            throw new Error("invalid type");
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
              type: this.unify(boolType, checked.type),
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
            this.unify(left.type, right.type);

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
          this.unify(checkedArg.type, argType);
          args.push(checkedArg);
        }
        return { tag: "call", callee, args, type: callee.type.returnType };
      }
      case "field": {
        const checkedExpr = this.checkExpr(expr.expr, null);
        if (checkedExpr.type.tag !== "struct") {
          throw new Error("not a struct");
        }
        const fieldIndex = checkedExpr.type.fields.findIndex(
          (f) => f.fieldName === expr.fieldName
        );
        const field = checkedExpr.type.fields[fieldIndex];
        if (!field) throw new Error("does not have this field");

        return {
          tag: "field",
          index: fieldIndex,
          expr: checkedExpr,
          type: field.type,
        };
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
          this.unify(boolType, checkedPredicate.type);
          const checkedBlock = this.checkBlock(block);
          resultType = this.unify(resultType, checkedBlock.type);
          res.cases.push({
            predicate: checkedPredicate,
            block: checkedBlock.block,
          });
        }

        const checkedElse = this.checkBlock(expr.elseBlock);
        res.elseBlock = checkedElse.block;
        res.type = this.unify(resultType, checkedElse.type);

        return res;
      }
    }
  }

  private checkNumber(type: Type) {
    if (type.tag !== "float" && type.tag !== "integer") {
      throw new Error("type mismatch");
    }
    return type;
  }

  private unify(left: Type | null, right: Type): Type {
    if (!left) return right;
    if (left.tag !== right.tag) throw new Error("type mismatch");

    switch (left.tag) {
      case "void":
      case "integer":
      case "float":
      case "string":
        return left;
      case "struct":
      case "enum":
        if (left.value === (right as typeof left).value) return left;
        throw new Error("type mismatch");
      case "func": {
        const returnType = this.unify(
          left.returnType,
          (right as typeof left).returnType
        );
        if (
          left.parameters.length !== (right as typeof left).parameters.length
        ) {
          throw new Error("arity mismatch");
        }
        const parameters = left.parameters.map((param, i) => {
          return this.unify(param, (right as typeof left).parameters[i]);
        });

        return { tag: "func", parameters, returnType };
      }
    }
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
      this.unify(checkedLeft.type, checkedRight.type)
    );
    return {
      tag: "callBuiltIn",
      opcode,
      args: [checkedLeft, checkedRight],
      type: outType ?? type,
    };
  }

  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.tag) {
      case "identifier":
        return this.types.get(type.value);
      case "func":
        return {
          tag: "func",
          parameters: type.parameters.map((param) => this.checkTypeExpr(param)),
          returnType: this.checkTypeExpr(type.returnType),
        };
    }
  }
}
