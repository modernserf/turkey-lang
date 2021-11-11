export enum Opcode {
  Halt,
  LoadPrimitive, // value
  LoadPointer, // value
  LoadLocal, // frameOffset
  LoadPointerOffset, // heapOffset
  StoreLocal, // frameOffset
  StorePointerOffset, // offset
  Drop,
  New, // size
  NewClosure, // size, target
  //
  Jump, // target
  JumpIfZero, // target
  Call, // arity, target
  CallClosure, // arity
  Return,
  //
  Add,
  Sub,
  Mul,
  Div,
  Mod,
  Neg,
  //
  Eq,
  Neq,
  Lt,
  Lte,
  Gt,
  Gte,
  //
  And,
  Or,
  Xor,
  Not,
  //
  Print,
}

function assert<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing value");
  return value;
}

type StackValue =
  | { tag: "primitive"; value: number }
  | { tag: "pointer"; value: number };

type HeapInternalValue =
  | { tag: "string"; value: string }
  | { tag: "object"; size: number }
  | { tag: "closure"; size: number; target: number }
  | { tag: "free" }
  | StackValue;

class Heap {
  private heap: HeapInternalValue[];
  constructor(constants: string[]) {
    // heap[0] is placeholder for null
    this.heap = [
      { tag: "free" },
      ...constants.map((str) => ({ tag: "string" as const, value: str })),
    ];
  }
  get(address: number, offset: number): StackValue {
    const res = assert(this.heap[address + offset]);
    if (res.tag === "primitive" || res.tag === "pointer") return res;
    throw new Error();
  }
  getString(address: number): string {
    const res = assert(this.heap[address]);
    if (res.tag !== "string") throw new Error();
    return res.value;
  }
  getClosureTarget(address: number): number {
    const res = assert(this.heap[address]);
    if (res.tag !== "closure") throw new Error();
    return res.target;
  }
  set(address: number, offset: number, value: StackValue) {
    const idx = address + offset;
    if (idx >= this.heap.length) throw new Error("setting past allocated heap");
    this.heap[idx] = value;
  }
  // TODO: free, free list, garbage collection
  object(size: number): number {
    this.heap.push({ tag: "object", size });
    const addr = this.heap.length; // NOTE: pointing to first element, not header
    for (let i = 0; i < size; i++) {
      this.heap.push({ tag: "free" });
    }
    return addr;
  }
  closure(size: number, target: number) {
    const addr = this.heap.length; // NOTE: pointing to header
    this.heap.push({ tag: "closure", size, target });
    for (let i = 0; i < size; i++) {
      this.heap.push({ tag: "free" });
    }
    return addr;
  }
  // istanbul ignore next
  toString(): string {
    return `[${this.heap
      .map((cell) => {
        switch (cell.tag) {
          case "object":
            return `(${cell.size})`;
          case "closure":
            return `(${cell.size},${cell.target})`;
          case "string":
            return `"${cell.value}"`;
          case "free":
            return "_";
          case "primitive":
            return String(cell.value);
          case "pointer":
            return `0x${cell.value.toString(16)}`;
        }
      })
      .join(" ")}]`;
  }
}

class StackFrame {
  constructor(
    public readonly offset: number,
    public readonly returnAddress: number,
    public readonly next: StackFrame | undefined
  ) {}
}

class Stack {
  private stack: StackValue[] = [];
  private frame: StackFrame;
  constructor() {
    this.frame = new StackFrame(0, 0, undefined);
  }
  push(value: StackValue): void {
    if (!value) throw new Error("missing value");
    this.stack.push(value);
  }
  peek(): StackValue {
    return assert(this.stack[this.stack.length - 1]);
  }
  pop(): StackValue {
    return assert(this.stack.pop());
  }
  local(offset: number): StackValue {
    return assert(this.stack[this.frame.offset + offset]);
  }
  setLocal(offset: number, value: StackValue): void {
    this.stack[this.frame.offset + offset] = value;
  }
  pushFrame(argCount: number, returnAddress: number): void {
    this.frame = new StackFrame(
      this.stack.length - argCount,
      returnAddress,
      this.frame
    );
  }
  popFrame(): number {
    const result = assert(this.stack.pop());
    this.stack.length = this.frame.offset;
    this.push(result);
    const returnAddress = this.frame.returnAddress;
    this.frame = assert(this.frame.next);
    return returnAddress;
  }
  // istanbul ignore next
  toString(): string {
    return `[${this.stack
      .map((local) => {
        switch (local.tag) {
          case "primitive":
            return String(local.value);
          case "pointer":
            return `0x${local.value.toString(16)}`;
        }
      })
      .join(" ")}]`;
  }
}

class Program {
  private ip = 0;
  constructor(private program: number[]) {}
  nextOp() {
    return this.program[this.ip++];
  }
  here(): number {
    return this.ip;
  }
  jump(address: number) {
    this.ip = address;
  }
}

export function interpret(data: { program: number[]; constants: string[] }) {
  return Interpreter.interpret(data);
}

class Interpreter {
  static interpret(data: { program: number[]; constants: string[] }) {
    const state = new Interpreter(data.program, data.constants);
    return state.runAll();
  }
  private stack: Stack = new Stack();
  private heap: Heap;
  private program: Program;
  private output: string[] = [];
  constructor(program: number[], constants: string[]) {
    this.program = new Program(program);
    this.heap = new Heap(constants);
  }
  private write(value: string): void {
    this.output.push(value);
  }
  private runAll() {
    while (true) {
      const op = this.program.nextOp();
      // console.log(
      //   this.program.here(),
      //   Opcode[op],
      //   this.stack.toString(),
      //   this.heap.toString()
      // );
      if (op === Opcode.Halt) break;
      this.run(op);
    }
    return this.output;
  }
  private run(op: Opcode) {
    switch (op) {
      case Opcode.LoadPrimitive:
        this.stack.push({ tag: "primitive", value: this.program.nextOp() });
        return;
      case Opcode.LoadPointer:
        this.stack.push({ tag: "pointer", value: this.program.nextOp() });
        return;
      case Opcode.LoadLocal:
        this.stack.push(this.stack.local(this.program.nextOp()));
        return;
      case Opcode.LoadPointerOffset: {
        const addr = this.stack.pop().value;
        this.stack.push(this.heap.get(addr, this.program.nextOp()));
        return;
      }
      case Opcode.Drop:
        this.stack.pop();
        return;
      case Opcode.StoreLocal:
        this.stack.setLocal(this.program.nextOp(), this.stack.pop());
        return;
      case Opcode.StorePointerOffset: {
        const value = this.stack.pop();
        const addr = this.stack.pop().value;
        this.heap.set(addr, this.program.nextOp(), value);
        return;
      }
      case Opcode.New: {
        const size = this.program.nextOp();
        const addr = this.heap.object(size);
        this.stack.push({ tag: "pointer", value: addr });
        return;
      }
      case Opcode.NewClosure: {
        const size = this.program.nextOp();
        const target = this.program.nextOp();
        const addr = this.heap.closure(size, target);
        this.stack.push({ tag: "pointer", value: addr });
        return;
      }
      case Opcode.Jump: {
        const target = this.program.nextOp();
        this.program.jump(target);
        return;
      }
      case Opcode.JumpIfZero: {
        const target = this.program.nextOp();
        const predicate = this.stack.pop();
        if (predicate.value === 0) {
          this.program.jump(target);
        }
        return;
      }
      case Opcode.Call: {
        const arity = this.program.nextOp();
        const target = this.program.nextOp();
        this.stack.pushFrame(arity, this.program.here());
        this.program.jump(target);
        return;
      }
      case Opcode.CallClosure: {
        const arity = this.program.nextOp();
        const ptr = this.stack.peek(); // leave closure ptr on stack to pass as additional arg
        const target = this.heap.getClosureTarget(ptr.value);
        this.stack.pushFrame(arity + 1, this.program.here());
        this.program.jump(target);
        return;
      }
      case Opcode.Return:
        this.program.jump(this.stack.popFrame());
        return;
      case Opcode.Add: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value + right.value });
        return;
      }
      case Opcode.Sub: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value - right.value });
        return;
      }
      case Opcode.Mod: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value % right.value });
        return;
      }
      case Opcode.Print: {
        const value = this.stack.pop();
        switch (value.tag) {
          case "primitive":
            this.write(String(value.value));
            return;
          case "pointer":
            this.write(this.heap.getString(value.value));
            return;
          // istanbul ignore next
          default:
            throw new Error();
        }
      }
      // istanbul ignore next
      default:
        console.error(Opcode[op]);
        throw new Error("unknown opcode");
    }
  }
}
