import { Stmt, Expr, Opcode, Type as TypeExpr } from "./types";
import { Assembler } from "./assembler";
import { Scope } from "./scope";

type Type =
  | { tag: "void" }
  | { tag: "integer" }
  | { tag: "float" }
  | { tag: "struct"; value: string }
  | { tag: "func"; parameters: Type[]; returnType: Type };
const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const boolType: Type = { tag: "struct", value: "Boolean" };

type FuncDecl = Stmt & { tag: "func" };

class CompileState {
  asm = new Assembler();
  mode: "script" | "func" = "script";
  types: Scope<string, Type> = new Scope();
  envTypes: Map<FuncDecl, Map<string, Type>> = new Map();
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
  const funcs = FuncOrganizer.run(program);
  const state = new CompileState();
  compileBlock(state, program);
  state.asm.halt();
  state.mode = "func";
  for (const func of funcs) {
    compileFunc(state, func, state.envTypes.get(func)!);
  }
  return state.asm.assemble();
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
    case "func": {
      const environmentTypes = new Map(
        stmt.environment!.map((env) => [env, state.getType(env)])
      );
      state.envTypes.set(stmt, environmentTypes);

      state.asm
        .newClosure(stmt.pointer!, ...stmt.environment!)
        .initLocal(stmt.name);

      state.bindType(stmt.name, {
        tag: "func",
        parameters: stmt.parameters.map((param) => compileTypeExpr(param.type)),
        returnType: compileTypeExpr(stmt.returnType),
      });
      return voidType;
    }
    case "return":
      if (state.mode === "func") {
        if (stmt.expr) {
          compileExpr(state, stmt.expr);
        } else {
          state.asm.number(0);
        }
        state.asm.return();
        return voidType;
      }
      throw new Error("cannot return from top level");
    case "expr": {
      return compileExpr(state, stmt.expr);
    }
  }
}

function compileTypeExpr(type: TypeExpr): Type {
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
    case "call": {
      const args = expr.args.map((arg) => compileExpr(state, arg));
      const func = compileExpr(state, expr.expr);
      if (func.tag !== "func") throw new Error("not callable");
      for (let i = 0; i < Math.max(args.length, func.parameters.length); i++) {
        unify(args[i] ?? voidType, func.parameters[i] ?? voidType);
      }
      state.asm.callClosure(args.length);
      return func.returnType;
    }
  }
}

function compileFunc(
  state: CompileState,
  func: FuncDecl,
  envTypes: Map<string, Type>
) {
  state.types = state.types.push();
  for (const param of func.parameters) {
    // TODO: this should be compiled already
    state.types.init(param.binding.value, compileTypeExpr(param.type));
  }
  for (const [name, type] of envTypes) {
    state.types.init(name, type);
  }

  state.asm.closure(
    func.pointer!,
    func.parameters.map((param) => param.binding.value),
    func.environment!
  );
  // TODO: use closureValue directly instead of copying to stack
  for (const envVar of func.environment!) {
    state.asm.closureValue(envVar).initLocal(envVar);
  }

  compileBlock(state, func.block);
  state.asm.endfunc();
  state.types = state.types.pop();
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

class FuncOrganizer {
  private funcs: FuncDecl[] = [];
  private stack: Array<{ params: Set<string>; env: Set<string> }> = [];
  static run(program: Stmt[]) {
    const funcOrganizer = new FuncOrganizer();
    funcOrganizer.block(program);
    return funcOrganizer.funcs;
  }
  private func(func: FuncDecl) {
    this.funcs.push(func);
    this.stack.push({
      params: new Set(func.parameters.map(({ binding }) => binding.value)),
      env: new Set(),
    });
    this.block(func.block);
    const frame = this.stack.pop()!;
    func.environment = Array.from(frame.env);
  }
  private identifier(name: string) {
    if (!this.stack.length) return;
    const { params, env } = this.stack[this.stack.length - 1];
    if (params.has(name)) return;
    env.add(name);
  }
  private block(block: Stmt[]) {
    for (const stmt of block) {
      this.stmt(stmt);
    }
  }
  private stmt(stmt: Stmt) {
    switch (stmt.tag) {
      case "func":
        this.func(stmt);
        return;
      case "let":
      case "expr":
      case "print":
        this.expr(stmt.expr);
        return;
      case "return":
        if (stmt.expr) this.expr(stmt.expr);
        return;
      case "while":
        this.block(stmt.block);
        return;
      // istanbul ignore next
      default:
        throw new Error();
    }
  }
  private expr(expr: Expr) {
    switch (expr.tag) {
      case "identifier":
        this.identifier(expr.value);
        return;
      case "integer":
      case "float":
      case "typeConstructor":
        return;
      case "unaryOp":
        this.expr(expr.expr);
        return;
      case "binaryOp":
        this.expr(expr.left);
        this.expr(expr.right);
        return;
      case "call":
        this.expr(expr.expr);
        for (const arg of expr.args) {
          this.expr(arg);
        }
        return;
      case "do":
        this.block(expr.block);
        return;
      case "if":
        for (const ifCase of expr.cases) {
          this.expr(ifCase.predicate);
          this.block(ifCase.block);
        }
        this.block(expr.elseBlock);
        return;
      // istanbul ignore next
      default:
        throw new Error();
    }
  }
}
