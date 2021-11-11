import { Op } from "./interpreter-3";

type FuncRecord = { args: string[] };

class LabelState {
  private labels: Map<string, number> = new Map();
  private labelRefs: Array<{ label: string; index: number; arity?: number }> =
    [];
  private funcs: Map<string, FuncRecord> = new Map();
  private currentFunc: FuncRecord | null = null;
  create(name: string, index: number): void {
    if (this.labels.has(name)) throw new Error("duplicate identifier");
    this.labels.set(name, index);
  }
  createFunc(name: string, index: number, args: string[]): void {
    if (this.currentFunc) throw new Error("cannot nest functions");
    this.currentFunc = { args };
    if (this.labels.has(name)) throw new Error("duplicate identifier");
    this.labels.set(name, index);
    this.funcs.set(name, this.currentFunc);
  }
  endFunc(): FuncRecord {
    if (!this.currentFunc) throw new Error("not in a function");
    const func = this.currentFunc;
    this.currentFunc = null;
    return func;
  }
  ref(label: string, index: number): void {
    this.labelRefs.push({ label, index });
  }
  callFunc(label: string, arity: number, index: number): void {
    this.labelRefs.push({ label, index, arity });
  }
  patch(program: Op[]): void {
    for (const { label, index } of this.labelRefs) {
      const addr = this.labels.get(label);
      if (addr === undefined) throw new Error();
      const op = program[index];
      switch (op.tag) {
        case "jump":
        case "jumpIfZero":
          op.target = addr;
          break;
        case "call": {
          const expectedArity = this.funcs.get(label)?.args.length;
          if (op.argCount !== expectedArity) throw new Error();
          op.target = addr;
          break;
        }
        default:
          throw new Error();
      }
    }
  }
}

class LocalsState {
  private locals: Map<string, number> = new Map();
  reset() {
    this.locals = new Map();
  }
  init(name: string): void {
    const index = this.locals.size;
    this.locals.set(name, index);
  }
  get(name: string): number {
    const offset = this.locals.get(name);
    if (offset === undefined) throw new Error("unknown identifier");
    return offset;
  }
  delete(name: string): void {
    const found = this.locals.delete(name);
    if (!found) throw new Error("unknown identifier");
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

export class Assembler {
  private program: Op[] = [];
  private labels = new LabelState();
  private locals = new LocalsState();
  private strings = new InternedStringsState();
  assemble(): { program: Op[]; constants: string[] } {
    this.labels.patch(this.program);
    return { program: this.program, constants: this.strings.getConstants() };
  }
  halt(): this {
    this.program.push({ tag: "halt" });
    return this;
  }
  number(value: number): this {
    this.program.push({
      tag: "load_immediate",
      value: { tag: "primitive", value },
    });
    return this;
  }
  string(value: string): this {
    const index = this.strings.use(value);
    this.program.push({
      tag: "load_immediate",
      value: { tag: "pointer", value: index },
    });
    return this;
  }
  initLocal(name: string): this {
    this.locals.init(name);
    return this;
  }
  local(name: string): this {
    const frameOffset = this.locals.get(name);
    this.program.push({ tag: "load_local", frameOffset });
    return this;
  }
  setLocal(name: string): this {
    const frameOffset = this.locals.get(name);
    this.program.push({ tag: "store_local", frameOffset });
    return this;
  }
  dropLocal(name: string): this {
    this.locals.delete(name);
    this.program.push({ tag: "drop" });
    return this;
  }
  object(size: number): this {
    this.program.push({ tag: "new", size });
    return this;
  }
  setHeap(offset: number): this {
    this.program.push({ tag: "store_pointer_offset", offset });
    return this;
  }
  getHeap(offset: number): this {
    this.program.push({ tag: "load_pointer_offset", offset });
    return this;
  }

  label(name: string): this {
    this.labels.create(name, this.program.length);
    return this;
  }
  jump(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push({ tag: "jump", target: 0 });
    return this;
  }
  jumpIfZero(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push({ tag: "jumpIfZero", target: 0 });
    return this;
  }
  add(): this {
    this.program.push({ tag: "add" });
    return this;
  }
  sub(): this {
    this.program.push({ tag: "sub" });
    return this;
  }
  mod(): this {
    this.program.push({ tag: "mod" });
    return this;
  }
  print(): this {
    this.program.push({ tag: "print" });
    return this;
  }

  func(name: string, ...args: string[]): this {
    this.labels.createFunc(name, this.program.length, args);
    this.locals.reset();
    for (const arg of args) {
      this.initLocal(arg);
    }
    return this;
  }
  endfunc(): this {
    this.labels.endFunc();
    this.locals.reset();
    return this;
  }
  call(funcName: string, arity: number): this {
    this.labels.callFunc(funcName, arity, this.program.length);
    this.program.push({ tag: "call", argCount: arity, target: 0 });
    return this;
  }
  return(): this {
    this.program.push({ tag: "return" });
    return this;
  }
}
