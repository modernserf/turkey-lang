class StackFrame {
  constructor(
    public locals: StackValue[],
    public readonly returnAddress: number
  ) {}
}

type StackValue =
  | { tag: "primitive"; value: number }
  | { tag: "pointer"; value: number };

type HeapValue =
  | { tag: "string"; value: string }
  | { tag: "object"; value: StackValue[] }
  | { tag: "closure"; index: number; args: StackValue[] };

type PointerOperand = { tag: "constant"; value: number } | { tag: "stack" };

type LoadSource =
  | { tag: "immediate"; value: StackValue } // ( -- value)
  | { tag: "local"; frameOffset: number } // ( -- value)
  | { tag: "pointer"; address: PointerOperand; offset: PointerOperand }
  | { tag: "dup" }; // (value -- value value)

type StoreDestination =
  | { tag: "drop" } // (value -- )
  | { tag: "local"; frameOffset: number } // (value -- )
  | { tag: "pointer"; address: PointerOperand; offset: PointerOperand };

type JumpTarget = { tag: "constant"; value: number } | { tag: "stack" };

type Op =
  | { tag: "halt" }
  | { tag: "load"; from: LoadSource }
  | { tag: "store"; to: StoreDestination }
  | { tag: "new"; type: HeapValue["tag"] }
  | { tag: "jump"; target: JumpTarget }
  | { tag: "jumpIfZero"; target: JumpTarget }
  | { tag: "call"; argCount: number; target: JumpTarget }
  | { tag: "return" }

  // arithmetic
  | { tag: "add" }
  | { tag: "sub" }
  | { tag: "mul" }
  | { tag: "div" }
  | { tag: "mod" }
  | { tag: "neg" }
  // compare
  | { tag: "eq" }
  | { tag: "neq" }
  | { tag: "lt" }
  | { tag: "lte" }
  | { tag: "gt" }
  | { tag: "gte" }
  // logical
  | { tag: "and" }
  | { tag: "or" }
  | { tag: "xor" }
  | { tag: "not" }
  // builtins
  | { tag: "print" };

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
          op.target = { tag: "constant", value: addr };
          break;
        case "call": {
          const expectedArity = this.funcs.get(label)?.args.length;
          if (op.argCount !== expectedArity) throw new Error();
          op.target = { tag: "constant", value: addr };
          break;
        }
        default:
          throw new Error();
      }
    }
  }
}

export class Assembler {
  private program: Op[] = [];
  private internedStrings: Map<string, number> = new Map();
  private labels = new LabelState();
  private locals: Map<string, number> = new Map();
  assemble(): { program: Op[]; constants: HeapValue[] } {
    this.labels.patch(this.program);
    return { program: this.program, constants: this.getConstants() };
  }

  private getConstants() {
    const constants: Array<HeapValue> = [];
    for (const [str, index] of this.internedStrings) {
      constants[index - 1] = { tag: "string", value: str };
    }
    return constants;
  }
  halt(): this {
    this.program.push({ tag: "halt" });
    return this;
  }
  number(value: number): this {
    this.program.push({
      tag: "load",
      from: { tag: "immediate", value: { tag: "primitive", value } },
    });
    return this;
  }
  string(value: string): this {
    let index = this.internedStrings.size + 1;
    if (this.internedStrings.has(value)) {
      index = this.internedStrings.get(value)!;
    } else {
      this.internedStrings.set(value, index);
    }
    this.program.push({
      tag: "load",
      from: { tag: "immediate", value: { tag: "pointer", value: index } },
    });
    return this;
  }
  initLocal(name: string): this {
    const index = this.locals.size;
    this.locals.set(name, index);
    return this;
  }
  local(name: string): this {
    const offset = this.locals.get(name);
    if (offset === undefined) throw new Error("unknown identifier");
    this.program.push({
      tag: "load",
      from: { tag: "local", frameOffset: offset },
    });
    return this;
  }
  setLocal(name: string): this {
    const offset = this.locals.get(name);
    if (offset === undefined) throw new Error("unknown identifier");
    this.program.push({
      tag: "store",
      to: { tag: "local", frameOffset: offset },
    });
    return this;
  }
  dropLocal(name: string): this {
    const found = this.locals.delete(name);
    if (!found) throw new Error("unknown identifier");
    this.program.push({
      tag: "store",
      to: { tag: "drop" },
    });
    return this;
  }
  label(name: string): this {
    this.labels.create(name, this.program.length);
    return this;
  }
  jump(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push({
      tag: "jump",
      target: { tag: "constant", value: 0 },
    });
    return this;
  }
  jumpIfZero(label: string): this {
    this.labels.ref(label, this.program.length);
    this.program.push({
      tag: "jumpIfZero",
      target: { tag: "constant", value: 0 },
    });
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
    for (const arg of args) {
      this.initLocal(arg);
    }
    return this;
  }
  endfunc(): this {
    const { args } = this.labels.endFunc();
    for (const arg of args) {
      const found = this.locals.delete(arg);
      if (!found) throw new Error("unknown identifier");
    }
    return this;
  }
  call(funcName: string, arity: number): this {
    this.labels.callFunc(funcName, arity, this.program.length);
    this.program.push({
      tag: "call",
      argCount: arity,
      target: { tag: "constant", value: 0 },
    });
    return this;
  }
  return(): this {
    this.program.push({ tag: "return" });
    return this;
  }
}

export function interpret(data: { program: Op[]; constants: HeapValue[] }) {
  const state = new InterpreterState(data.program, data.constants);
  runAll(state);
  return state.getOutput();
}

class InterpreterState {
  private stack: StackFrame[];
  private heap: HeapValue[];
  private ip = 0;
  private output: string[] = [];
  constructor(private program: Op[], constants: HeapValue[]) {
    this.stack = [new StackFrame([], 0)];
    // heap[0] is placeholder for null
    this.heap = [{ tag: "object", value: [] }, ...constants];
  }
  getOutput() {
    return this.output;
  }
  nextOp() {
    return this.program[this.ip++];
  }
  jump(address: number) {
    this.ip = address;
  }
  private frame(): StackFrame {
    return this.stack[this.stack.length - 1];
  }
  push(value: StackValue) {
    this.frame().locals.push(value);
  }
  pop(): StackValue {
    return this.frame().locals.pop()!;
  }
  local(offset: number): StackValue {
    return this.frame().locals[offset];
  }
  setLocal(offset: number, value: StackValue) {
    this.frame().locals[offset] = value;
  }
  getHeap(address: number, offset: number): StackValue {
    const heapValue = this.heap[address];
    switch (heapValue.tag) {
      case "object":
        return heapValue.value[offset];
      default:
        throw new Error();
    }
  }
  setHeap(address: number, offset: number, value: StackValue) {
    const heapValue = this.heap[address];
    if (!heapValue) throw new Error();
    switch (heapValue.tag) {
      case "object":
        heapValue.value[offset] = value;
        return;
      default:
        throw new Error();
    }
  }
  allocate(value: HeapValue): number {
    return this.heap.push(value) - 1;
  }
  pushFrame(argCount: number) {
    const args = this.frame().locals.splice(-argCount, argCount);
    const returnAddress = this.ip;
    this.stack.push(new StackFrame(args, returnAddress));
  }
  popFrame() {
    const prevFrame = this.stack.pop()!;
    const result = prevFrame.locals.pop()!;
    const returnAddress = prevFrame.returnAddress;
    this.push(result);
    this.jump(returnAddress);
  }
  write(value: string) {
    this.output.push(value);
  }
  getString(address: number): string {
    const heapValue = this.heap[address];
    if (!heapValue || heapValue.tag !== "string") throw new Error();
    return heapValue.value;
  }
}

function runAll(state: InterpreterState) {
  while (true) {
    const op = state.nextOp();
    if (op.tag === "halt") return;
    run(state, op);
  }
}

function run(state: InterpreterState, op: Op) {
  switch (op.tag) {
    case "load":
      switch (op.from.tag) {
        case "dup": {
          const value = state.pop();
          state.push(value);
          state.push(value);
          return;
        }
        case "immediate":
          state.push(op.from.value);
          return;
        case "local":
          state.push(state.local(op.from.frameOffset));
          return;
        case "pointer": {
          const offset = getOperand(state, op.from.offset);
          const addr = getOperand(state, op.from.address);
          state.push(state.getHeap(addr, offset));
          return;
        }
        default:
          throw new Error();
      }
    case "store":
      switch (op.to.tag) {
        case "drop":
          state.pop();
          return;
        case "local":
          state.setLocal(op.to.frameOffset, state.pop());
          return;
        case "pointer": {
          const value = state.pop();
          const offset = getOperand(state, op.to.offset);
          const addr = getOperand(state, op.to.address);
          state.setHeap(addr, offset, value);
          return;
        }
        default:
          throw new Error();
      }
    case "new":
      switch (op.type) {
        case "object":
          state.allocate({ tag: "object", value: [] });
          return;
        default:
          throw new Error();
      }
    case "jump": {
      const index = getOperand(state, op.target);
      state.jump(index);
      return;
    }
    case "jumpIfZero": {
      const predicate = state.pop();
      const index = getOperand(state, op.target);
      if (predicate.value === 0) {
        state.jump(index);
      }
      return;
    }
    case "call": {
      const index = getOperand(state, op.target);
      state.pushFrame(op.argCount);
      state.jump(index);
      return;
    }
    case "return":
      state.popFrame();
      return;
    case "add": {
      const right = state.pop();
      const left = state.pop();
      state.push({ tag: "primitive", value: left.value + right.value });
      return;
    }
    case "sub": {
      const right = state.pop();
      const left = state.pop();
      state.push({ tag: "primitive", value: left.value - right.value });
      return;
    }
    case "mod": {
      const right = state.pop();
      const left = state.pop();
      state.push({ tag: "primitive", value: left.value % right.value });
      return;
    }
    case "print": {
      const value = state.pop();
      switch (value.tag) {
        case "primitive":
          state.write(String(value.value));
          return;
        case "pointer":
          state.write(state.getString(value.value));
          return;
      }
      return;
    }

    default:
      console.error(op);
      throw new Error("unknown opcode");
  }
}

function getOperand(state: InterpreterState, operand: PointerOperand): number {
  switch (operand.tag) {
    case "constant":
      return operand.value;
    case "stack":
      return state.pop().value;
  }
}
