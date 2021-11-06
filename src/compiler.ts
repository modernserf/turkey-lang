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

export function compile(program: Stmt[]): CompileResult {
  return new Compiler(program);
}

type ScopeRecord = { index: number; type: Type; constant: boolean };

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
    this.map.set(key, { type, index, constant: false });
  }
  addConstant(key: string, type: Type, index: number): void {
    this.map.set(key, { type, index, constant: true });
  }
  push(): Scope {
    return new Scope(this);
  }
  pop(): Scope {
    // istanbul ignore next
    if (!this.parent) throw new Error(`Cannot pop bottom scope`);
    return this.parent;
  }
}

class Compiler {
  program = new Uint8Array(256);
  constants: any[] = [];
  private length = 0;
  private scope = new Scope();
  constructor(input: Stmt[]) {
    this.setupConstants();
    this.compileBlock(input);
    this.writeByte(Opcode.Halt);
    this.program = this.program.slice(0, this.length);
  }
  private writeByte(byte: number) {
    this.checkSize();
    this.program[this.length] = byte;
    this.length++;
  }
  private checkSize() {
    if (this.length === this.program.length) {
      const old = this.program;
      this.program = new Uint8Array(this.program.length << 1);
      this.program.set(old);
    }
  }
  private setupConstants() {
    this.scope.addConstant("True", boolType, this.constants.push(true) - 1);
    this.scope.addConstant("False", boolType, this.constants.push(false) - 1);
  }
  private compileBlock(input: Stmt[]): Type {
    this.scope = this.scope.push();
    this.writeByte(Opcode.PushScope);
    let returnType = voidType;
    for (const stmt of input) {
      // drop the result of the previous statement if its a non-void expr
      if (returnType.tag !== "void") {
        this.writeByte(Opcode.Drop);
      }
      returnType = this.compileStmt(stmt);
    }
    if (returnType.tag === "void") {
      this.writeByte(Opcode.PopScopeVoid);
    } else {
      this.writeByte(Opcode.PopScope);
    }
    this.scope = this.scope.pop();
    return returnType;
  }
  private compileStmt(stmt: Stmt): Type {
    switch (stmt.tag) {
      case "print":
        this.compileExpr(stmt.expr);
        this.writeByte(Opcode.Print);
        return voidType;
      case "let": {
        const inferredType = this.compileExpr(stmt.expr);
        this.writeByte(Opcode.InitLocal);
        const name = stmt.binding.value;
        this.scope.add(name, inferredType);
        return voidType;
      }
      case "expr":
        return this.compileExpr(stmt.expr);
    }
  }
  private compileExpr(expr: Expr): Type {
    switch (expr.tag) {
      case "identifier": {
        return this.compileIdent(expr.value);
      }
      case "typeConstructor": {
        return this.compileIdent(expr.value);
      }
      case "integer": {
        if (expr.value > -128 && expr.value < 127) {
          this.writeByte(Opcode.IntImmediate);
          this.writeByte(expr.value);
        } else {
          this.compileConstant(expr.value);
        }
        return integerType;
      }
      case "float": {
        this.compileConstant(expr.value);
        return floatType;
      }
      case "binaryOp": {
        switch (expr.operator) {
          case "+":
            return this.arithmeticOp(expr, Opcode.AddInt, Opcode.AddFloat);
          case "-":
            return this.arithmeticOp(expr, Opcode.SubInt, Opcode.SubFloat);
          case "*":
            return this.arithmeticOp(expr, Opcode.MulInt, Opcode.MulFloat);
          case "/":
            this.arithmeticOp(expr, Opcode.DivInt, Opcode.DivFloat);
            return floatType;
          // istanbul ignore next
          default:
            throw new Error("unknown operator");
        }
      }
      case "do": {
        return this.compileBlock(expr.block);
      }
    }
  }
  private compileIdent(name: string): Type {
    const result = this.scope.get(name);
    if (result.constant) {
      this.writeByte(Opcode.Constant);
      this.writeByte(result.index);
    } else {
      this.writeByte(Opcode.GetLocal);
      this.writeByte(result.index);
    }
    return result.type;
  }
  private compileConstant(value: any) {
    const index = this.constants.push(value) - 1;
    this.writeByte(Opcode.Constant);
    this.writeByte(index); // TODO: more than 256 constants
  }
  private arithmeticOp(
    expr: { left: Expr; right: Expr },
    intOp: Opcode,
    floatOp: Opcode
  ): Type {
    const leftType = this.compileExpr(expr.left);
    const rightType = this.compileExpr(expr.right);
    const exprType = this.unify(leftType, rightType);
    switch (exprType.tag) {
      case "float":
        this.writeByte(floatOp);
        return exprType;
      case "integer":
        this.writeByte(intOp);
        return exprType;
      default:
        throw new Error("operands must be numbers");
    }
  }
  private unify(left: Type, right: Type) {
    if (left.tag !== right.tag) {
      throw new Error("type error");
    }
    return left;
  }
}
