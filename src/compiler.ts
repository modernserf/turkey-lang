import {
  CheckedBinding,
  CheckedExpr,
  CheckedStmt,
  CheckedStructFieldBinding,
} from "./types";
import { Scope } from "./scope";
import { Writer } from "./writer";
import { noMatch } from "./utils";

type QueuedFunc = {
  label: symbol;
  block: CheckedStmt[];

  parameters: CheckedBinding[];
  upvalues: string[];
};

type QueuedBinding = {
  label: symbol;
  fields: CheckedStructFieldBinding[];
};

export function compile(program: CheckedStmt[]) {
  return new Compiler().compileProgram(program);
}

type Label = string | symbol;
type JumpTableRef = { labels: Label[]; index: number };
class LabelState {
  private labels: Scope<Label, number> = new Scope();
  private labelRefs: Array<{ label: Label; index: number }> = [];
  private jumpTableRefs: JumpTableRef[] = [];
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
  jumpTable(size: number): Label[] {
    const ref: JumpTableRef = { labels: [], index: this.writer.nextIndex() };
    this.writer.jumpTable(size);
    for (let i = 0; i < size; i++) {
      const label = Symbol(i);
      ref.labels.push(label);
    }
    this.jumpTableRefs.push(ref);
    return ref.labels;
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
    for (const { labels, index } of this.jumpTableRefs) {
      const offsets = labels.map((label) => this.labels.get(label) - index - 1);
      this.writer.patchJumpTable(index, offsets);
    }
  }
}

class LocalsState {
  private locals: Scope<Label, number> = new Scope();
  constructor(private writer: Writer) {}
  size() {
    return this.locals.size;
  }
  init(name: Label): void {
    const index = this.locals.size;
    this.locals.set(name, index);
  }
  get(name: Label): void {
    this.writer.loadLocal(this.locals.get(name));
  }
  inScope(fn: () => void) {
    this.locals = this.locals.push();
    fn();
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
  private locals: LocalsState;
  private strings = new InternedStringsState();
  private bindingQueue: QueuedBinding[] = [];
  constructor() {
    this.labels = new LabelState(this.asm);
    this.locals = new LocalsState(this.asm);
  }
  compileProgram(program: CheckedStmt[]): {
    program: number[];
    constants: string[];
  } {
    this.locals.inScope(() => {
      for (const stmt of program) {
        this.compileStmt(stmt);
      }
    });
    this.asm.halt();

    for (const func of this.funcs) {
      this.compileFuncBody(func);
    }

    this.labels.patch();
    return {
      program: this.asm.compile(),
      constants: this.strings.getConstants(),
    };
  }
  private compileBlock(block: CheckedStmt[]) {
    const count = this.locals.inScope(() => {
      this.compileBlockInner(block);
    });
    if (hasValue(block)) {
      // value at top of the stack is result
      // copy to the eventual new top of the stack
      this.asm.setLocal(this.locals.size());
    } else if (count > 0) {
      // value at top of stack is local; drop it
      this.asm.drop();
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
      valueOnStack = stmt.tag === "expr" && stmt.hasValue;
    }
  }
  private flushBindingQueue() {
    let queuedBinding;
    // eslint-disable-next-line no-cond-assign
    while ((queuedBinding = this.bindingQueue.shift())) {
      for (const field of queuedBinding.fields) {
        this.locals.get(queuedBinding.label);
        this.asm.getHeap(field.fieldIndex);
        this.compileBinding(field.binding);
      }
    }
  }
  private compileBinding(binding: CheckedBinding) {
    switch (binding.tag) {
      case "identifier":
        this.locals.init(binding.value);
        return;
      case "struct": {
        const label = Symbol("<destructured>");
        this.locals.init(label);
        this.bindingQueue.push({ label, fields: binding.fields });
        return;
      }
      // istanbul ignore next
      default:
        return noMatch(binding);
    }
  }
  private compileStmt(stmt: CheckedStmt) {
    switch (stmt.tag) {
      case "expr":
        this.compileExpr(stmt.expr);
        return;
      case "let":
        this.compileExpr(stmt.expr);
        this.compileBinding(stmt.binding);
        this.flushBindingQueue();
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
        this.compileFuncHeader(stmt.name, Symbol(stmt.name), stmt);
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
        this.locals.get(expr.value);
        return;
      case "primitive":
        this.asm.loadPrimitive(expr.value);
        return;
      case "string":
        this.asm.loadPointer(this.strings.use(expr.value));
        return;
      case "enum":
        if (expr.fields.length === 0) {
          this.asm.loadPrimitive(expr.index);
          return;
        }
        this.asm
          .newObject(expr.fields.length + 1)
          .dup()
          .loadPrimitive(expr.index)
          .setHeap(0);
        for (const [i, value] of expr.fields.entries()) {
          this.asm.dup();
          this.compileExpr(value);
          this.asm.setHeap(i + 1);
        }
        return;
      case "struct":
        this.asm.newObject(expr.fields.length);
        for (const [i, value] of expr.fields.entries()) {
          this.asm.dup();
          this.compileExpr(value);
          this.asm.setHeap(i);
        }
        return;
      case "closure": {
        this.compileFuncHeader(null, Symbol("closure"), expr);
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
      case "match": {
        const condEnd = Symbol("cond_end");
        this.compileExpr(expr.expr);
        const predicateRef = Symbol("predicate");
        this.locals.init(predicateRef);
        this.asm.dup();
        const labels = this.labels.jumpTable(expr.cases.size);
        for (const { index, bindings, block } of expr.cases.values()) {
          this.labels.create(labels[index]);
          this.locals.inScope(() => {
            for (const { fieldIndex, binding } of bindings) {
              this.locals.get(predicateRef);
              this.asm.getHeap(fieldIndex);
              this.compileBinding(binding);
            }
            this.flushBindingQueue();

            this.compileBlock(block);
          });
          this.labels.jump(condEnd);
        }
        this.panic("pattern match with no branch taken");
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
  private compileFuncHeader(
    bindAs: string | null,
    funcLabel: symbol,
    stmt: {
      parameters: { binding: CheckedBinding }[];
      upvalues: { name: string }[];
      block: CheckedStmt[];
    }
  ) {
    const upvalues = stmt.upvalues.map((val) => val.name);
    this.funcs.push({
      label: funcLabel,
      block: stmt.block,
      parameters: stmt.parameters.map((p) => p.binding),
      upvalues,
    });

    this.labels.newClosure(funcLabel, upvalues.length);
    // func statements can be recursive
    if (bindAs !== null) {
      this.locals.init(bindAs);
    }

    for (const [i, name] of upvalues.entries()) {
      this.asm.dup();
      this.locals.get(name);
      this.asm.setHeap(i);
    }
    return;
  }
  private compileFuncBody(func: QueuedFunc) {
    this.labels.create(func.label);
    this.locals.inScope(() => {
      for (const param of func.parameters) {
        this.compileBinding(param);
      }

      const upvaluesLabel = Symbol("upvalues");
      this.locals.init(upvaluesLabel);
      for (const [i, upval] of func.upvalues.entries()) {
        this.locals.get(upvaluesLabel);
        this.asm.getHeap(i);
        this.locals.init(upval);
      }

      this.flushBindingQueue();
      this.compileBlockInner(func.block);
    });
  }
  private panic(message: string) {
    this.strings.use(`PANIC: ${message}`);
    this.asm.halt();
  }
}

function hasValue(block: CheckedStmt[]): boolean {
  if (!block.length) return false;
  const stmt = block[block.length - 1];
  return stmt.tag === "expr" && stmt.hasValue;
}
