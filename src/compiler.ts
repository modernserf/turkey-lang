import { Binding, CheckedExpr, CheckedStmt } from "./types";
import { Scope } from "./scope";
import { Writer } from "./writer";

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

type Label = string | symbol;
class LabelState {
  private labels: Scope<Label, number> = new Scope();
  private labelRefs: Array<{ label: Label; index: number; arity?: number }> =
    [];
  constructor(private writer: Writer) {}
  create(name: Label): void {
    const index = this.writer.nextIndex();
    this.labels.init(name, index);
  }
  jump(label: Label) {
    this.ref(label, this.writer.nextIndex());
    this.writer.jump();
  }
  jumpIfZero(label: Label) {
    this.ref(label, this.writer.nextIndex());
    this.writer.jumpIfZero();
  }
  newClosure(label: Label, size: number) {
    this.ref(label, this.writer.nextIndex());
    this.writer.newClosure(size);
  }
  private ref(label: Label, index: number): void {
    this.labelRefs.push({ label, index });
  }
  patch(): void {
    for (const { label, index } of this.labelRefs) {
      const addr = this.labels.get(label);
      this.writer.patchAddress(index, addr);
    }
  }
}

class LocalsState {
  private locals: Scope<string, number> = new Scope();
  size() {
    return this.locals.size;
  }
  init(name: string): void {
    const index = this.locals.size;
    this.locals.set(name, index);
  }
  get(name: string): number {
    return this.locals.get(name);
  }
  pushScope(): void {
    this.locals = this.locals.push();
  }
  popScope(): number {
    const before = this.locals.size;
    this.locals = this.locals.pop();
    const after = this.locals.size;
    return before - after;
  }
}

class InternedStringsState {
  private internedStrings: Map<string, number> = new Map();
  getConstants(): string[] {
    const constants: string[] = [];
    for (const [str, index] of this.internedStrings) {
      constants[index - 1] = str;
    }
    return constants;
  }
  use(value: string) {
    const index = this.internedStrings.get(value);
    if (index !== undefined) return index;

    const newIndex = this.internedStrings.size + 1;
    this.internedStrings.set(value, newIndex);
    return newIndex;
  }
}

class Compiler {
  private asm = new Writer();
  private funcs: QueuedFunc[] = [];
  private labels: LabelState;
  private locals = new LocalsState();
  private strings = new InternedStringsState();
  constructor() {
    this.labels = new LabelState(this.asm);
  }
  compileProgram(program: CheckedStmt[]): {
    program: number[];
    constants: string[];
  } {
    this.locals.pushScope();
    for (const stmt of program) {
      this.compileStmt(stmt);
    }
    this.locals.popScope();
    this.asm.halt();
    for (const func of this.funcs) {
      this.labels.create(func.label);
      this.locals.pushScope();

      for (const param of func.parameters) {
        this.locals.init(param);
      }
      this.locals.init("$");
      for (const [i, upval] of func.upvalues.entries()) {
        this.asm.loadLocal(this.locals.get("$")).getHeap(i);
        this.locals.init(upval);
      }

      this.compileBlockInner(func.block);

      this.locals.popScope();
    }

    this.labels.patch();
    return {
      program: this.asm.compile(),
      constants: this.strings.getConstants(),
    };
  }
  private compileBlock(block: CheckedStmt[]) {
    this.locals.pushScope();

    this.compileBlockInner(block);

    const count = this.locals.popScope();
    if (hasValue(block)) {
      // value at top of the stack is result
      // copy to the eventual new top of the stack
      this.asm.setLocal(this.locals.size());
    } else {
      // TODO: why am i not dropping here?
    }
    // drop everything else
    for (let i = 0; i < count - 1; i++) {
      this.asm.drop();
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
        this.locals.init(stmt.binding.value);
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
        this.labels.create(loopBegin);
        this.compileExpr(stmt.expr);
        this.labels.jumpIfZero(loopEnd);

        this.compileBlock(stmt.block);
        if (hasValue(stmt.block)) {
          this.asm.drop();
        }

        this.labels.jump(loopBegin);
        this.labels.create(loopEnd);
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
        this.asm.loadLocal(this.locals.get(expr.value));
        return;
      case "primitive":
        this.asm.loadPrimitive(expr.value);
        return;
      case "string":
        this.asm.loadPointer(this.strings.use(expr.value));
        return;
      case "struct":
        this.asm.newObject(expr.value.length);
        for (const [i, value] of expr.value.entries()) {
          this.asm.dup();
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
          this.labels.create(conds[i]);
          this.compileExpr(predicate);
          this.labels.jumpIfZero(conds[i + 1]);
          this.compileBlock(block);
          this.labels.jump(condEnd);
        }

        this.labels.create(condElse);
        this.compileBlock(expr.elseBlock);
        this.labels.create(condEnd);
        return;
      }
      case "callBuiltIn":
        for (const arg of expr.args) {
          this.compileExpr(arg);
        }
        this.asm.writeOpcode(expr.opcode);
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
    funcLabel: symbol,
    stmt: {
      parameters: { binding: Binding }[];
      upvalues: { name: string }[];
      block: CheckedStmt[];
    }
  ) {
    const parameters = stmt.parameters.map((param) => param.binding.value);
    const upvalues = stmt.upvalues.map((val) => val.name);
    this.funcs.push({
      label: funcLabel,
      block: stmt.block,
      parameters,
      upvalues,
    });

    this.labels.newClosure(funcLabel, upvalues.length);
    // func statements can be recursive
    if (bindAs !== null) {
      this.locals.init(bindAs);
    }

    for (const [i, name] of upvalues.entries()) {
      this.asm //
        .dup()
        .loadLocal(this.locals.get(name))
        .setHeap(i);
    }
    return;
  }
}

function hasValue(block: CheckedStmt[]): boolean {
  if (!block.length) return false;
  const stmt = block[block.length - 1];
  return stmt.tag === "expr" && stmt.expr.type.tag !== "void";
}
