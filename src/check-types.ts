import {
  Stmt,
  Expr,
  TypeExpr,
  Type,
  CheckedStmt,
  CheckedExpr,
  Opcode,
} from "./types";
import { Scope } from "./scope";

const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const boolType: Type = { tag: "struct", value: "Boolean" };

type CurrentFunc = {
  returnType: Type;
  upvalues: Map<string, Type>;
  outerScope: Scope<string, Type>;
};

// istanbul ignore next
function noMatch(value: never) {
  throw new Error("no match");
}

export function check(program: Stmt[]): CheckedStmt[] {
  return TypeChecker.check(program);
}

class TypeChecker {
  private scope: Scope<string, Type> = new Scope();
  private currentFunc: CurrentFunc | null = null;
  static check(program: Stmt[]): CheckedStmt[] {
    return new TypeChecker().checkBlock(program).block;
  }

  private checkBlock(block: Stmt[]): { block: CheckedStmt[]; type: Type } {
    const checkedBlock: CheckedStmt[] = [];
    let type = voidType;
    this.scope = this.scope.push();
    for (const stmt of block) {
      const checkedStmt = this.checkStmt(stmt);
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
  private checkStmt(stmt: Stmt): CheckedStmt {
    switch (stmt.tag) {
      case "expr":
        return { tag: "expr", expr: this.checkExpr(stmt.expr) };
      case "print": {
        const expr = this.checkExpr(stmt.expr);
        // TODO: support printing strings, forbid printing other values?
        return {
          tag: "expr",
          expr: {
            tag: "callBuiltIn",
            opcode: Opcode.PrintNum,
            args: [expr],
            type: voidType,
          },
        };
      }
      case "let": {
        const expr = this.checkExpr(stmt.expr);
        if (stmt.type) {
          this.unify(expr.type, this.checkTypeExpr(stmt.type));
        }
        this.scope.init(stmt.binding.value, expr.type);
        return { tag: "let", binding: stmt.binding, expr };
      }
      case "while": {
        const checkedPredicate = this.checkExpr(stmt.expr);
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
        const expr = this.checkExpr(stmt.expr);
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
        const { block } = this.checkBlock(stmt.block);

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
  private checkExpr(expr: Expr): CheckedExpr {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, type: integerType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
      case "identifier": {
        const type = this.scope.get(expr.value);

        if (this.currentFunc) {
          if (this.scope.isUpvalue(expr.value, this.currentFunc.outerScope)) {
            this.currentFunc.upvalues.set(expr.value, type);
          }
        }

        return { tag: "identifier", value: expr.value, type };
      }
      case "typeConstructor":
        switch (expr.value) {
          case "True":
            return { tag: "primitive", value: 1, type: boolType };
          case "False":
            return { tag: "primitive", value: 0, type: boolType };
          default:
            throw new Error("Unknown primitive");
        }
      case "unaryOp": {
        const checked = this.checkExpr(expr.expr);
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
            throw new Error("unknown operator");
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
          case "/": {
            const res = this.arithmeticOp(Opcode.Div, expr.left, expr.right);
            res.type = floatType;
            return res;
          }
          // istanbul ignore next
          default:
            throw new Error("unknown operator");
        }
      }
      case "call": {
        const callee = this.checkExpr(expr.expr);
        if (callee.type.tag !== "func") {
          throw new Error("not callable");
        }
        if (callee.type.parameters.length !== expr.args.length) {
          throw new Error("arity mismatch");
        }
        const args: CheckedExpr[] = [];
        for (const [i, arg] of expr.args.entries()) {
          const checkedArg = this.checkExpr(arg);
          this.unify(checkedArg.type, callee.type.parameters[i]);
          args.push(checkedArg);
        }
        return { tag: "call", callee, args, type: callee.type.returnType };
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
          const checkedPredicate = this.checkExpr(predicate);
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

  private unify(left: Type | null, right: Type) {
    if (!left) return right;
    if (left !== right) throw new Error("type mismatch");
    return left;
  }

  private arithmeticOp(opcode: Opcode, left: Expr, right: Expr): CheckedExpr {
    const checkedLeft = this.checkExpr(left);
    const checkedRight = this.checkExpr(right);
    const type = this.checkNumber(
      this.unify(checkedLeft.type, checkedRight.type)
    );
    return {
      tag: "callBuiltIn",
      opcode,
      args: [checkedLeft, checkedRight],
      type,
    };
  }

  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.value) {
      case "Int":
        return integerType;
      case "Float":
        return floatType;
      case "Boolean":
        return boolType;
      case "Void":
        return voidType;
      default:
        throw new Error("unknown type");
    }
  }
}
