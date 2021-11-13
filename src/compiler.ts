import { Stmt, Expr, Opcode } from "./types";
import { Assembler } from "./assembler";
import { Scope } from "./scope";

type Type =
  | { tag: "void" }
  | { tag: "integer" }
  | { tag: "float" }
  | { tag: "struct"; value: string };
const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const boolType: Type = { tag: "struct", value: "Boolean" };

class CompileState {
  asm = new Assembler();
  private types: Scope<string, Type> = new Scope();
  bindType(name: string, type: Type) {
    this.types.init(name, type);
  }
  getType(name: string): Type {
    return this.types.get(name);
  }
  scope() {
    this.types = this.types.push();
    this.asm.scope();
  }
  popScope(type: Type) {
    this.types = this.types.pop();
    if (type.tag === "void") {
      this.asm.endScopeVoid();
    } else {
      this.asm.endScopeValue();
    }
  }
}

export function compile(program: Stmt[]) {
  const state = new CompileState();
  compileBlock(state, program);
  return state.asm.halt().assemble();
}

// if these return non-void, it put a value on the stack

function compileStmt(state: CompileState, stmt: Stmt): Type {
  switch (stmt.tag) {
    case "let": {
      const type = compileExpr(state, stmt.expr);
      const name = stmt.binding.value;
      state.asm.initLocal(name);
      state.bindType(name, type);
      return voidType;
    }
    case "while": {
      const loopBegin = Symbol("loop_begin");
      const loopEnd = Symbol("loop_end");
      state.asm.label(loopBegin);
      unify(boolType, compileExpr(state, stmt.expr));
      state.asm.jumpIfZero(loopEnd);
      const blockType = compileBlock(state, stmt.block);
      if (blockType.tag !== "void") state.asm.drop();
      state.asm //
        .jump(loopBegin)
        .label(loopEnd);
      return voidType;
    }
    case "print": {
      compileExpr(state, stmt.expr);
      state.asm.printNum();
      return voidType;
    }
    case "expr": {
      return compileExpr(state, stmt.expr);
    }
  }
}

function compileBlock(state: CompileState, block: Stmt[]): Type {
  state.scope();
  let returnType = voidType;
  for (const stmt of block) {
    if (returnType.tag !== "void") {
      state.asm.drop();
    }
    returnType = compileStmt(state, stmt);
  }
  state.popScope(returnType);
  return returnType;
}

function compileExpr(state: CompileState, expr: Expr): Type {
  switch (expr.tag) {
    case "integer":
      state.asm.number(expr.value);
      return integerType;
    case "float":
      state.asm.number(expr.value);
      return floatType;
    case "identifier":
      state.asm.local(expr.value);
      return state.getType(expr.value);
    case "typeConstructor":
      switch (expr.value) {
        case "True":
          state.asm.number(1);
          return boolType;
        case "False":
          state.asm.number(0);
          return boolType;
        // istanbul ignore next
        default:
          throw new Error("not yet implemented");
      }
    case "do":
      return compileBlock(state, expr.block);
    case "if": {
      let returnType: Type | null = null;
      const condEnd = Symbol("cond_end");
      const condElse = Symbol("cond_else");
      const conds = expr.cases.map((_, i) => Symbol(`cond_${i}`));
      conds.push(condElse);

      for (const [i, { predicate, block }] of expr.cases.entries()) {
        state.asm.label(conds[i]);
        unify(boolType, compileExpr(state, predicate));
        state.asm.jumpIfZero(conds[i + 1]);
        const type = compileBlock(state, block);
        returnType = unify(returnType, type);
        state.asm.jump(condEnd);
      }

      state.asm.label(condElse);
      const type = compileBlock(state, expr.elseBlock);
      returnType = unify(returnType, type);

      state.asm.label(condEnd);
      return returnType;
    }
    case "unaryOp": {
      const type = compileExpr(state, expr.expr);
      switch (expr.operator) {
        case "!":
          unify(boolType, type);
          state.asm.write(Opcode.Not);
          return type;
        case "-":
          checkNumber(type);
          state.asm.write(Opcode.Neg);
          return type;
        // istanbul ignore next
        default:
          throw new Error("unknown operator");
      }
    }
    case "binaryOp": {
      const left = compileExpr(state, expr.left);
      const right = compileExpr(state, expr.right);
      switch (expr.operator) {
        case "+":
          return arithmeticOp(state, Opcode.Add, left, right);
        case "-":
          return arithmeticOp(state, Opcode.Sub, left, right);
        case "*":
          return arithmeticOp(state, Opcode.Mul, left, right);
        case "/":
          arithmeticOp(state, Opcode.Div, left, right);
          return floatType;
        // istanbul ignore next
        default:
          throw new Error("unknown operator");
      }
    }
  }
}

function arithmeticOp(
  state: CompileState,
  op: Opcode,
  left: Type,
  right: Type
) {
  unify(left, right);
  checkNumber(left);
  state.asm.write(op);
  return left;
}

function checkNumber(type: Type) {
  if (type.tag !== "float" && type.tag !== "integer") {
    throw new Error("type mismatch");
  }
}

function unify(left: Type | null, right: Type) {
  if (!left) return right;
  if (left !== right) throw new Error("type mismatch");
  return left;
}
