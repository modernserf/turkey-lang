import { Builtin, IRExpr, IRStmt } from "../ir";
import { Opcode } from "../opcode";
import { Writer } from "../writer";
import { noMatch } from "../utils";
import { Scope } from "../scope";

/* TODO 
remove `upvalues, recur` from IR, move to OptimizedIR type
add optimizer pass between check & compile
*/

type Result = {
  program: number[];
  constants: string[];
};

export function compile(program: IRStmt[]): Result {
  return new Compiler().compile(program);
}

const builtins: Record<Builtin, { code: Opcode[]; hasValue: boolean }> = {
  add: { code: [Opcode.Add], hasValue: true },
  eq: { code: [Opcode.Eq], hasValue: true },
  lt: { code: [Opcode.Lt], hasValue: true },
  mod: { code: [Opcode.Mod], hasValue: true },
  print_num: { code: [Opcode.PrintNum], hasValue: false },
  print_string: { code: [Opcode.PrintStr], hasValue: false },
  sub: { code: [Opcode.Sub], hasValue: true },
};

type QueuedFunc = {
  label: symbol;
  block: IRStmt[];
  upvalues: symbol[];
  parameters: symbol[];
};

const callee = Symbol("callee");

export class Compiler {
  private asm = new Writer();
  private labels = new LabelState(this.asm);
  private varIndex = 0;
  private vars = new Map<symbol, number>();
  private strings = new Map<string, number>();
  private funcs: QueuedFunc[] = [];
  compile(program: IRStmt[]): Result {
    this.block(program);
    this.asm.halt();
    this.funcs.forEach((func) => {
      this.compileFunc(func);
    });
    this.labels.patch();
    return {
      program: this.asm.compile(),
      constants: Array.from(this.strings.keys()),
    };
  }
  private stmt(stmt: IRStmt): { hasValue: boolean } {
    switch (stmt.tag) {
      case "expr":
        return this.expr(stmt.expr);
      case "let": {
        const res = this.expr(stmt.expr);
        // void assignments should be eliminated by the typechecker
        if (!res.hasValue) throw new Error("assigning void to var");
        this.initVar(stmt.binding);
        return { hasValue: false };
      }
      case "return":
        if (stmt.expr) {
          this.expr(stmt.expr);
          this.asm.return();
        } else {
          this.asm.returnVoid();
        }
        return { hasValue: false };
      case "while": {
        const loopIn = Symbol("loop_in");
        const loopOut = Symbol("loop_out");
        this.labels.create(loopIn);
        this.expr(stmt.expr);
        this.labels.jumpIfZero(loopOut);
        const res = this.block(stmt.block);
        if (res.hasValue) this.asm.drop();
        this.labels.jump(loopIn);
        this.labels.create(loopOut);
        return { hasValue: false };
      }
      case "for": {
        const iter = Symbol("iter");
        const loopIn = Symbol("loop_in");
        const loopOut = Symbol("loop_out");
        // evaluate the list & store as `iter` var
        // either `0` => Nil or `[1, value, next]` => Cons(value, next)
        this.expr(stmt.expr);
        this.initVar(iter);
        // allocate space for list item
        this.asm.loadPrimitive(0);
        this.initVar(stmt.binding);
        // start loop and check if list is done
        this.labels.create(loopIn);
        this.getVar(iter);
        this.labels.jumpIfZero(loopOut);
        // set the current list item
        this.getVar(iter);
        this.asm.dup().getHeap(1);
        this.setVar(stmt.binding);
        // update the rest of the list
        this.asm.getHeap(2);
        this.setVar(iter);
        // run the loop
        const res = this.block(stmt.block);
        if (res.hasValue) this.asm.drop();
        this.labels.jump(loopIn);
        // exit
        this.labels.create(loopOut);
        return { hasValue: false };
      }
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
  private expr(expr: IRExpr): { hasValue: boolean } {
    switch (expr.tag) {
      case "primitive":
        this.asm.loadPrimitive(expr.value);
        return { hasValue: true };
      case "string":
        this.asm.loadPointer(this.internString(expr.value));
        return { hasValue: true };
      case "object":
        this.asm.newObject(expr.value.length);
        expr.value.forEach((value, i) => {
          this.asm.dup();
          this.expr(value);
          this.asm.setHeap(i);
        });
        return { hasValue: true };
      case "ident":
        this.getVar(expr.value);
        return { hasValue: true };
      case "recur":
        this.getVar(callee);
        return { hasValue: true };
      case "field":
        this.expr(expr.target);
        this.asm.getHeap(expr.index);
        return { hasValue: true };
      case "builtin": {
        expr.args.forEach((arg) => this.expr(arg));
        const op = builtins[expr.value];
        // istanbul ignore next
        if (!op) throw new Error("unknown opcode");
        this.asm.writeOpcode(...op.code);
        return { hasValue: op.hasValue };
      }
      case "call":
        expr.args.forEach((arg) => this.expr(arg));
        this.expr(expr.callee);
        this.asm.callClosure(expr.args.length);
        return { hasValue: expr.hasValue };
      case "do":
        return this.block(expr.block);
      case "if": {
        const caseElse = Symbol("case_else");
        const end = Symbol("end");
        const cases = expr.ifCases.map((_, i) => Symbol(`case_${i}`));
        cases.push(caseElse);

        expr.ifCases.forEach(({ expr, block }, i) => {
          this.labels.create(cases[i]);
          this.expr(expr);
          this.labels.jumpIfZero(cases[i + 1]);
          this.block(block);
          this.labels.jump(end);
        });

        this.labels.create(caseElse);
        const res = this.block(expr.elseBlock);
        this.labels.create(end);
        return res;
      }
      case "match": {
        const end = Symbol("end");

        this.expr(expr.expr);
        this.initVar(expr.binding);
        this.asm.dup();
        const cases = this.labels.jumpTable(expr.matchCases.length);
        let res = { hasValue: false };
        expr.matchCases.forEach(({ index, block }) => {
          this.labels.create(cases[index]);
          res = this.block(block);
          this.labels.jump(end);
        });
        this.labels.create(end);
        return res;
      }
      case "func": {
        const ref = Symbol("func");
        this.labels.func(ref);
        this.asm.newClosure(expr.upvalues.length);
        expr.upvalues.forEach(({ expr }, i) => {
          this.asm.dup();
          this.expr(expr);
          this.asm.setHeap(i);
        });
        this.queueFunc({
          label: ref,
          block: expr.block,
          upvalues: expr.upvalues.map((u) => u.binding),
          parameters: expr.parameters,
        });
        return { hasValue: true };
      }
      // istanbul ignore next
      default:
        noMatch(expr);
    }
  }
  private block(block: IRStmt[]): { hasValue: boolean } {
    let hasValue = false;
    block.forEach((stmt) => {
      if (hasValue) this.asm.drop();
      hasValue = this.stmt(stmt).hasValue;
    });
    return { hasValue };
  }
  private internString(string: string): number {
    if (this.strings.has(string)) return this.strings.get(string) as number;
    const index = this.strings.size + 1;
    this.strings.set(string, index);
    return index;
  }
  private getVar(value: symbol): void {
    const index = this.vars.get(value) as number;
    this.asm.loadLocal(index);
  }
  private initVar(value: symbol): void {
    this.vars.set(value, this.varIndex++);
  }
  private setVar(value: symbol): void {
    const index = this.vars.get(value) as number;
    this.asm.setLocal(index);
  }
  private queueFunc(func: QueuedFunc): void {
    this.funcs.push(func);
  }
  private compileFunc(func: QueuedFunc): void {
    this.varIndex = 0;
    this.labels.create(func.label);
    // stack frame is params starting at 0, followed by callee
    func.parameters.forEach((param) => {
      this.initVar(param);
    });
    // assign callee var to current callee
    // this is used both for upvalues and for recursion
    this.initVar(callee);
    // copy values out of callee object onto stack
    func.upvalues.forEach((upval, i) => {
      this.getVar(callee);
      this.asm.getHeap(i);
      this.initVar(upval);
    });
    const res = this.block(func.block);
    // handle implicit returns
    if (res.hasValue) {
      this.asm.return();
    } else {
      this.asm.returnVoid();
    }
  }
}

type Label = symbol;
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
  func(label: Label) {
    this.ref(label, this.writer.nextIndex());
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
