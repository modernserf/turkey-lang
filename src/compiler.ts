import { Stmt, Expr, Opcode, CompileResult } from "./types";

type Type =
  | { tag: "void" }
  | { tag: "integer" }
  | { tag: "float" }
  | { tag: "struct"; value: string };
const voidType: Type = { tag: "void" };
const integerType: Type = { tag: "integer" };
const floatType: Type = { tag: "float" };
const boolType: Type = { tag: "struct", value: "Boolean" };

type ScopeRecord = { index: number; type: Type };

class Scope {
  private map: Map<string, ScopeRecord> = new Map();
  private stackSize = 0;
  constructor(private parent?: Scope) {
    if (parent) this.stackSize = parent.stackSize + 1; // +1 for frame pointer
  }
  get(key: string): ScopeRecord {
    const value = this.map.get(key);
    if (value !== undefined) return value;
    if (this.parent) return this.parent.get(key);
    throw new Error(`Unidentified variable ${key}`);
  }
  add(key: string, type: Type): void {
    if (this.map.has(key)) throw new Error(`Redefining variable ${key}`);
    const index = this.stackSize;
    this.stackSize++;
    this.map.set(key, { type, index });
  }
}

class ByteWriter {
  private program = new Uint8Array(256);
  private length = 0;
  result(): Uint8Array {
    return this.program.slice(0, this.length);
  }
  writeByte(byte: number): number {
    this.checkSize();
    const prevLength = this.length;
    this.program[this.length++] = byte;
    return prevLength;
  }
  write32(number: number): number {
    this.checkSize();
    const prevLength = this.length;
    // little endian i guess?
    this.program[this.length++] = number & 0xff;
    this.program[this.length++] = (number >> 8) & 0xff;
    this.program[this.length++] = (number >> 16) & 0xff;
    this.program[this.length++] = (number >> 24) & 0xff;
    return prevLength;
  }
  writeBack(index: number): void {
    this.program[index++] = this.length & 0xff;
    this.program[index++] = (this.length >> 8) & 0xff;
    this.program[index++] = (this.length >> 16) & 0xff;
    this.program[index++] = (this.length >> 24) & 0xff;
  }
  private checkSize() {
    if (this.length > this.program.length - 16) {
      const old = this.program;
      this.program = new Uint8Array(this.program.length << 1);
      this.program.set(old);
    }
  }
}

class CompilerState {
  constructor(
    public constants: number[] = [],
    public output = new ByteWriter(),
    public scope = new Scope()
  ) {}
  inScope<T>(fn: (state: CompilerState) => T): T {
    const nextState = new CompilerState(
      this.constants,
      this.output,
      new Scope(this.scope)
    );
    return fn(nextState);
  }
}

export function compile(input: Stmt[]): CompileResult {
  const state = new CompilerState();
  compileBlock(state, input);
  state.output.writeByte(Opcode.Halt);
  return { constants: state.constants, program: state.output.result() };
}

function compileBlock(outerState: CompilerState, input: Stmt[]): Type {
  return outerState.inScope((state) => {
    state.output.writeByte(Opcode.PushScope);
    let returnType = voidType;
    for (const stmt of input) {
      // drop the result of the previous statement if its a non-void expr
      if (returnType.tag !== "void") {
        state.output.writeByte(Opcode.Drop);
      }
      returnType = compileStmt(state, stmt);
    }
    if (returnType.tag === "void") {
      state.output.writeByte(Opcode.PopScopeVoid);
    } else {
      state.output.writeByte(Opcode.PopScope);
    }
    return returnType;
  });
}

function compileStmt(state: CompilerState, stmt: Stmt): Type {
  switch (stmt.tag) {
    case "print":
      compileExpr(state, stmt.expr);
      state.output.writeByte(Opcode.Print);
      return voidType;
    case "let": {
      const inferredType = compileExpr(state, stmt.expr);
      state.output.writeByte(Opcode.InitLocal);
      const name = stmt.binding.value;
      state.scope.add(name, inferredType);
      return voidType;
    }
    case "expr":
      return compileExpr(state, stmt.expr);
  }
}

function compileExpr(state: CompilerState, expr: Expr): Type {
  switch (expr.tag) {
    case "identifier": {
      return compileIdent(state, expr.value);
    }
    case "typeConstructor": {
      switch (expr.value) {
        case "True":
          state.output.writeByte(Opcode.IntImmediate);
          state.output.writeByte(1);
          return boolType;
        case "False":
          state.output.writeByte(Opcode.IntImmediate);
          state.output.writeByte(0);
          return boolType;
        // istanbul ignore next
        default:
          throw new Error("TODO: type constructors");
      }
    }
    case "integer": {
      if (expr.value > -128 && expr.value < 127) {
        state.output.writeByte(Opcode.IntImmediate);
        state.output.writeByte(expr.value);
      } else {
        compileConstant(state, expr.value);
      }
      return integerType;
    }
    case "float": {
      compileConstant(state, expr.value);
      return floatType;
    }
    case "binaryOp": {
      switch (expr.operator) {
        case "+":
          return arithmeticOp(state, expr, Opcode.AddInt, Opcode.AddFloat);
        case "-":
          return arithmeticOp(state, expr, Opcode.SubInt, Opcode.SubFloat);
        case "*":
          return arithmeticOp(state, expr, Opcode.MulInt, Opcode.MulFloat);
        case "/":
          arithmeticOp(state, expr, Opcode.DivInt, Opcode.DivFloat);
          return floatType;
        // istanbul ignore next
        default:
          throw new Error("unknown operator");
      }
    }
    case "do": {
      return compileBlock(state, expr.block);
    }
    case "if": {
      const endJumps: number[] = [];
      let type: Type | null = null;
      for (const cond of expr.cases) {
        unify(boolType, compileExpr(state, cond.predicate));
        state.output.writeByte(Opcode.JumpIfZero);
        const skip = state.output.write32(0);
        const blockType = compileBlock(state, cond.block);
        type = unify(type, blockType);
        state.output.writeByte(Opcode.Jump);
        endJumps.push(state.output.write32(0));
        state.output.writeBack(skip);
      }
      type = unify(type, compileBlock(state, expr.elseBlock));
      for (const jump of endJumps) {
        state.output.writeBack(jump);
      }
      return type;
    }
  }
}

function compileIdent(state: CompilerState, name: string): Type {
  const result = state.scope.get(name);
  state.output.writeByte(Opcode.GetLocal);
  state.output.writeByte(result.index);
  return result.type;
}

function compileConstant(state: CompilerState, value: number) {
  const index = state.constants.push(value) - 1;
  state.output.writeByte(Opcode.Constant);
  state.output.writeByte(index); // TODO: more than 256 constants
}

function arithmeticOp(
  state: CompilerState,
  expr: { left: Expr; right: Expr },
  intOp: Opcode,
  floatOp: Opcode
): Type {
  const leftType = compileExpr(state, expr.left);
  const rightType = compileExpr(state, expr.right);
  const exprType = unify(leftType, rightType);
  switch (exprType.tag) {
    case "float":
      state.output.writeByte(floatOp);
      return exprType;
    case "integer":
      state.output.writeByte(intOp);
      return exprType;
    default:
      throw new Error("operands must be numbers");
  }
}

function unify(left: Type | null, right: Type): Type {
  if (!left) return right;

  if (left.tag !== right.tag) {
    throw new Error("type error");
  }
  return left;
}
