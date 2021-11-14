import { Assembler } from "./assembler";
import { CheckedExpr, CheckedStmt } from "./types";

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
      for (const stmt of func.block) {
        this.compileStmt(stmt);
      }
      this.asm.endfunc();
    }
    return this.asm.assemble();
  }
  compileBlock(block: CheckedStmt[]) {
    this.asm.scope();
    let valueOnStack = false;
    for (const stmt of block) {
      if (valueOnStack) {
        this.asm.drop();
      }
      this.compileStmt(stmt);
      valueOnStack = stmt.tag === "expr";
    }
    if (hasValue(block)) {
      this.asm.endScopeValue();
    } else {
      this.asm.endScopeVoid();
    }
  }
  compileStmt(stmt: CheckedStmt) {
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
        const label = Symbol(stmt.name);
        const parameters = stmt.parameters.map((param) => param.binding.value);
        const upvalues = stmt.upvalues.map((val) => val.name);
        this.funcs.push({
          label,
          block: stmt.block,
          parameters,
          upvalues,
        });

        this.asm //
          .newClosure(label, ...upvalues)
          .initLocal(stmt.name);
        return;
      }
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
  compileExpr(expr: CheckedExpr) {
    switch (expr.tag) {
      case "identifier":
        this.asm.local(expr.value);
        return;
      case "primitive":
        this.asm.number(expr.value);
        return;
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
      // istanbul ignore next
      default:
        noMatch(expr);
    }
  }
}

function hasValue(block: CheckedStmt[]): boolean {
  if (!block.length) return false;
  const stmt = block[block.length - 1];
  return stmt.tag === "expr" && stmt.expr.type.tag !== "void";
}
