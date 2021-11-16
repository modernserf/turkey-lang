import { Assembler } from "./assembler";
import { Binding, CheckedExpr, CheckedStmt, Opcode } from "./types";

// istanbul ignore next
function noMatch(value: never) {
  throw new Error("no match");
}

type QueuedFunc = {
  label: symbol;
  block: CheckedStmt[];

  parameters: string[];
  upvalues: string[];
};

export function compile(program: CheckedStmt[]) {
  return new Compiler().compileProgram(program);
}

class Compiler {
  asm = new Assembler();
  funcs: QueuedFunc[] = [];
  compileProgram(program: CheckedStmt[]) {
    for (const stmt of program) {
      this.compileStmt(stmt);
    }
    this.asm.halt();
    for (const func of this.funcs) {
      this.asm.closure(func.label, func.parameters, func.upvalues);
      this.compileBlockInner(func.block);
      this.asm.endfunc();
    }
    return this.asm.assemble();
  }
  private compileBlock(block: CheckedStmt[]) {
    this.asm.scope();
    this.compileBlockInner(block);
    if (hasValue(block)) {
      this.asm.endScopeValue();
    } else {
      this.asm.endScopeVoid();
    }
  }
  private compileBlockInner(block: CheckedStmt[]) {
    let valueOnStack = false;
    for (const stmt of block) {
      if (valueOnStack) {
        this.asm.drop();
      }
      this.compileStmt(stmt);
      valueOnStack = stmt.tag === "expr" && stmt.expr.type.tag !== "void";
    }
  }
  private compileStmt(stmt: CheckedStmt) {
    switch (stmt.tag) {
      case "expr":
        this.compileExpr(stmt.expr);
        return;
      case "let":
        this.compileExpr(stmt.expr);
        this.asm.initLocal(stmt.binding.value);
        return;
      case "return":
        if (stmt.expr) {
          this.compileExpr(stmt.expr);
          this.asm.return();
        } else {
          this.asm.returnVoid();
        }
        return;
      case "while": {
        const loopBegin = Symbol("loop_begin");
        const loopEnd = Symbol("loop_end");
        this.asm.label(loopBegin);
        this.compileExpr(stmt.expr);
        this.asm.jumpIfZero(loopEnd);

        this.compileBlock(stmt.block);
        if (hasValue(stmt.block)) {
          this.asm.drop();
        }

        this.asm //
          .jump(loopBegin)
          .label(loopEnd);
        return;
      }
      case "func": {
        this.compileFunc(stmt.name, Symbol(stmt.name), stmt);
        return;
      }
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
  private compileExpr(expr: CheckedExpr) {
    switch (expr.tag) {
      case "identifier":
        this.asm.local(expr.value);
        return;
      case "primitive":
        this.asm.number(expr.value);
        return;
      case "string":
        this.asm.string(expr.value);
        return;
      case "struct":
        this.asm.newObject(expr.value.length);
        for (const [i, value] of expr.value.entries()) {
          this.asm.write(Opcode.Dup);
          this.compileExpr(value);
          this.asm.setHeap(i);
        }
        return;
      case "closure": {
        this.compileFunc(null, Symbol("closure"), expr);
        return;
      }

      case "do":
        this.compileBlock(expr.block);
        return;
      case "if": {
        const condEnd = Symbol("cond_end");
        const condElse = Symbol("cond_else");
        const conds = expr.cases.map((_, i) => Symbol(`cond_${i}`));
        conds.push(condElse);

        for (const [i, { predicate, block }] of expr.cases.entries()) {
          this.asm.label(conds[i]);
          this.compileExpr(predicate);
          this.asm.jumpIfZero(conds[i + 1]);
          this.compileBlock(block);
          this.asm.jump(condEnd);
        }

        this.asm.label(condElse);
        this.compileBlock(expr.elseBlock);
        this.asm.label(condEnd);
        return;
      }
      case "callBuiltIn":
        for (const arg of expr.args) {
          this.compileExpr(arg);
        }
        this.asm.write(expr.opcode);
        return;
      case "call":
        for (const arg of expr.args) {
          this.compileExpr(arg);
        }
        this.compileExpr(expr.callee);
        this.asm.callClosure(expr.args.length);
        return;
      case "field": {
        this.compileExpr(expr.expr);
        this.asm.getHeap(expr.index);
        return;
      }
      // istanbul ignore next
      default:
        noMatch(expr);
    }
  }
  private compileFunc(
    bindAs: string | null,
    label: symbol,
    stmt: {
      parameters: { binding: Binding }[];
      upvalues: { name: string }[];
      block: CheckedStmt[];
    }
  ) {
    //func
    const parameters = stmt.parameters.map((param) => param.binding.value);
    const upvalues = stmt.upvalues.map((val) => val.name);
    this.funcs.push({
      label,
      block: stmt.block,
      parameters,
      upvalues,
    });

    this.asm.newClosure(bindAs, label, upvalues);
    return;
  }
}

function hasValue(block: CheckedStmt[]): boolean {
  if (!block.length) return false;
  const stmt = block[block.length - 1];
  return stmt.tag === "expr" && stmt.expr.type.tag !== "void";
}
