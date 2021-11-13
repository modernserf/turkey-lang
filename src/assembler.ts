import { Scope } from "./scope";
import { Opcode } from "./types";

type Label = string | symbol;

type FuncRecord = { args: string[]; env?: string[] };

class LabelState {
  private labels: Scope<Label, number> = new Scope();
  private labelRefs: Array<{ label: Label; index: number; arity?: number }> =
    [];
  private funcs: Map<Label, FuncRecord> = new Map();
  private currentFunc: FuncRecord | null = null;
  create(name: Label, index: number): void {
    this.labels.init(name, index);
  }
  createFunc(name: Label, index: number, args: string[], env?: string[]): void {
    if (this.currentFunc) throw new Error("cannot nest functions");
    this.currentFunc = { args, env };
    this.labels.init(name, index);
    this.funcs.set(name, this.currentFunc);
  }
  endFunc(): FuncRecord {
    if (!this.currentFunc) throw new Error("not in a function");
    const func = this.currentFunc;
    this.currentFunc = null;
    return func;
  }
  ref(label: Label, index: number): void {
    this.labelRefs.push({ label, index });
  }
  callFunc(label: Label, arity: number, index: number): void {
    this.labelRefs.push({ label, index, arity });
  }
  patch(program: number[]): void {
    for (const { label, index } of this.labelRefs) {
      const addr = this.labels.get(label);
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
        // istanbul ignore next
        default:
          throw new Error();
      }
    }
  }
}

class LocalsState {
  private locals: Scope<string, number> = new Scope();
  reset() {
    this.locals = new Scope();
  }
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

export class Assembler {
  private program: number[] = [];
  private labels = new LabelState();
  private locals = new LocalsState();
  private strings = new InternedStringsState();
  private closureValues: Scope<string, number> = new Scope();
  assemble(): { program: number[]; constants: string[] } {
    this.labels.patch(this.program);
    return { program: this.program, constants: this.strings.getConstants() };
  }
  write(opcode: Opcode): this {
    this.program.push(opcode);
    return this;
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
  drop(): this {
    this.program.push(Opcode.Drop);
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

  scope(): this {
    this.locals.pushScope();
    return this;
  }
  endScopeVoid(): this {
    const count = this.locals.popScope();
    for (let i = 0; i < count; i++) {
      this.drop();
    }
    return this;
  }
  endScopeValue(): this {
    const count = this.locals.popScope();
    // copy the value at the previouss top of the stack
    // to the eventual new top of the stack
    this.program.push(Opcode.StoreLocal, this.locals.size());
    // drop everything else
    for (let i = 0; i < count - 1; i++) {
      this.drop();
    }
    return this;
  }

  newObject(size: number): this {
    this.program.push(Opcode.New, size);
    return this;
  }
  newClosure(label: string, ...capturedVars: string[]): this {
    this.labels.ref(label, this.program.length);

    this.program.push(Opcode.NewClosure, capturedVars.length, 0);
    for (const [i, name] of capturedVars.entries()) {
      this.program.push(Opcode.Dup);
      this.local(name).setHeap(i);
    }

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

  label(name: Label): this {
    this.labels.create(name, this.program.length);
    return this;
  }
  jump(label: Label): this {
    this.labels.ref(label, this.program.length);
    this.program.push(Opcode.Jump, 0);
    return this;
  }
  jumpIfZero(label: Label): this {
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

  func(name: Label, ...args: string[]): this {
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

  closure(name: Label, args: string[], env: string[]): this {
    this.labels.createFunc(name, this.program.length, args, env);
    this.locals.reset();
    for (const arg of args) {
      this.initLocal(arg);
    }
    this.initLocal("$");
    this.closureValues = new Scope();
    for (const [i, arg] of env.entries()) {
      this.closureValues.init(arg, i);
    }
    return this;
  }
  closureValue(name: string): this {
    this.local("$").getHeap(this.closureValues.get(name));
    return this;
  }

  call(funcName: Label, arity: number): this {
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
