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
  length = 0;
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
  compileBlock(state, input, false);
  state.output.writeByte(Opcode.Halt);
  return { constants: state.constants, program: state.output.result() };
}

function compileBlock(
  outerState: CompilerState,
  input: Stmt[],
  expectResult: boolean
): Type {
  return outerState.inScope((state) => {
    if (input.length === 0) return voidType;

    state.output.writeByte(Opcode.PushScope);

    // all but last statement
    for (let i = 0; i < input.length - 1; i++) {
      compileStmt(state, input[i], false);
    }

    const returnType = compileStmt(
      state,
      input[input.length - 1],
      expectResult
    );

    if (returnType.tag === "void") {
      state.output.writeByte(Opcode.PopScopeVoid);
    } else {
      state.output.writeByte(Opcode.PopScope);
    }
    return returnType;
  });
}

function compileStmt(
  state: CompilerState,
  stmt: Stmt,
  expectResult: boolean
): Type {
  switch (stmt.tag) {
    case "print":
      compileExpr(state, stmt.expr, true);
      state.output.writeByte(Opcode.Print);
      return voidType;
    case "let": {
      const inferredType = compileExpr(state, stmt.expr, true);
      const name = stmt.binding.value;
      state.scope.add(name, inferredType);
      return voidType;
    }
    case "while": {
      const backIntoLoopPtr = state.output.length;
      unify(boolType, compileExpr(state, stmt.expr, true));
      state.output.writeByte(Opcode.JumpIfZero);
      const outOfLoopPtr = state.output.write32(0);

      compileBlock(state, stmt.block, false);
      state.output.writeByte(Opcode.Jump);
      state.output.write32(backIntoLoopPtr);

      state.output.writeBack(outOfLoopPtr);
      return voidType;
    }
    case "expr": {
      const type = compileExpr(state, stmt.expr, expectResult);
      if (!expectResult && type.tag !== "void") {
        state.output.writeByte(Opcode.Drop);
        return voidType;
      } else {
        return type;
      }
    }
  }
}

function compileExpr(
  state: CompilerState,
  expr: Expr,
  expectResult: boolean
): Type {
  switch (expr.tag) {
    case "identifier": {
      return compileIdent(state, expr.value);
    }
    case "typeConstructor": {
      switch (expr.value) {
        case "True":
          state.output.writeByte(Opcode.IntImmediate);
          state.output.writeByte(-1);
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
        case "==":
        case "!=": {
          const leftType = compileExpr(state, expr.left, true);
          const rightType = compileExpr(state, expr.right, true);
          const exprType = unify(leftType, rightType);
          state.output.writeByte(Opcode.Eq);
          if (expr.operator === "!=") {
            state.output.writeByte(Opcode.BitNot);
          }
          return exprType;
        }
        // istanbul ignore next
        default:
          throw new Error("unknown operator");
      }
    }
    case "unaryOp":
      switch (expr.operator) {
        case "!":
          unify(boolType, compileExpr(state, expr.expr, true));
          state.output.writeByte(Opcode.BitNot);
          return boolType;
        case "-": {
          const type = compileExpr(state, expr.expr, true);
          switch (type.tag) {
            case "integer":
              state.output.writeByte(Opcode.NegInt);
              return type;
            case "float":
              state.output.writeByte(Opcode.NegFloat);
              return type;
            default:
              throw new Error("type error");
          }
        }
        // istanbul ignore next
        default:
          throw new Error("unknown operator");
      }
    case "do": {
      return compileBlock(state, expr.block, expectResult);
    }
    case "if": {
      const endJumps: number[] = [];
      let type: Type | null = null;
      for (const cond of expr.cases) {
        unify(boolType, compileExpr(state, cond.predicate, true));
        state.output.writeByte(Opcode.JumpIfZero);
        const skip = state.output.write32(0);
        const blockType = compileBlock(state, cond.block, expectResult);
        type = unify(type, blockType);
        state.output.writeByte(Opcode.Jump);
        endJumps.push(state.output.write32(0));
        state.output.writeBack(skip);
      }
      type = unify(type, compileBlock(state, expr.elseBlock, expectResult));
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
  const leftType = compileExpr(state, expr.left, true);
  const rightType = compileExpr(state, expr.right, true);
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
