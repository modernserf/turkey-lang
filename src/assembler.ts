import { Opcode } from "./interpreter-3";

type FuncRecord = { args: string[]; env?: string[] };

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
  createFunc(
    name: string,
    index: number,
    args: string[],
    env?: string[]
  ): void {
    if (this.currentFunc) throw new Error("cannot nest functions");
    this.currentFunc = { args, env };
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
  patch(program: number[]): void {
    for (const { label, index } of this.labelRefs) {
      const addr = this.labels.get(label);
      if (addr === undefined) throw new Error();
      const op = program[index];
      switch (op) {
        case Opcode.Jump:
        case Opcode.JumpIfZero:
          program[index + 1] = addr;
          break;
        case Opcode.NewClosure:
          program[index + 2] = addr;
          break;
        case Opcode.Call: {
          const arity = program[index + 1];
          const expectedArity = this.funcs.get(label)?.args.length;
          if (arity !== expectedArity) throw new Error();
          program[index + 2] = addr;
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
  private program: number[] = [];
  private labels = new LabelState();
  private locals = new LocalsState();
  private strings = new InternedStringsState();
  assemble(): { program: number[]; constants: string[] } {
    this.labels.patch(this.program);
    return { program: this.program, constants: this.strings.getConstants() };
  }
  halt(): this {
    this.program.push(Opcode.Halt);
    return this;
  }
  number(value: number): this {
    this.program.push(Opcode.LoadPrimitive, value);
    return this;
  }
  string(value: string): this {
    const index = this.strings.use(value);
    this.program.push(Opcode.LoadPointer, index);
    return this;
  }
  initLocal(name: string): this {
    this.locals.init(name);
    return this;
  }
  local(name: string): this {
    const frameOffset = this.locals.get(name);
    this.program.push(Opcode.LoadLocal, frameOffset);
    return this;
  }
  setLocal(name: string): this {
    const frameOffset = this.locals.get(name);
    this.program.push(Opcode.StoreLocal, frameOffset);
    return this;
  }
  dropLocal(name: string): this {
    this.locals.delete(name);
    this.program.push(Opcode.Drop);
    return this;
  }

  newObject(size: number): this {
    this.program.push(Opcode.New, size);
    return this;
  }
  newClosure(size: number, label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push(Opcode.NewClosure, size, 0);
    return this;
  }
  setHeap(offset: number): this {
    this.program.push(Opcode.StorePointerOffset, offset);
    return this;
  }
  getHeap(offset: number): this {
    this.program.push(Opcode.LoadPointerOffset, offset);
    return this;
  }

  label(name: string): this {
    this.labels.create(name, this.program.length);
    return this;
  }
  jump(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push(Opcode.Jump, 0);
    return this;
  }
  jumpIfZero(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push(Opcode.JumpIfZero, 0);
    return this;
  }
  add(): this {
    this.program.push(Opcode.Add);
    return this;
  }
  sub(): this {
    this.program.push(Opcode.Sub);
    return this;
  }
  mod(): this {
    this.program.push(Opcode.Mod);
    return this;
  }
  print(): this {
    this.program.push(Opcode.Print);
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
  closure(name: string, args: string[], env: string[]): this {
    this.labels.createFunc(name, this.program.length, args, env);
    this.locals.reset();
    for (const arg of args) {
      this.initLocal(arg);
    }
    this.initLocal("$");
    for (const [i, arg] of env.entries()) {
      this.local("$")
        .getHeap(i + 1)
        .initLocal(arg);
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
    this.program.push(Opcode.Call, arity, 0);
    return this;
  }
  callClosure(arity: number): this {
    this.program.push(Opcode.CallClosure, arity);
    return this;
  }
  return(): this {
    this.program.push(Opcode.Return);
    return this;
  }
}
