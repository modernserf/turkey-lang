type StackValue =
  | { tag: "primitive"; value: number }
  | { tag: "pointer"; value: number };

export type Op =
  | { tag: "halt" }
  | { tag: "load_immediate"; value: StackValue }
  | { tag: "load_local"; frameOffset: number }
  | { tag: "load_pointer_offset"; offset: number }
  | { tag: "store_local"; frameOffset: number }
  | { tag: "store_pointer_offset"; offset: number }
  | { tag: "drop" }
  | { tag: "new"; size: number }
  | { tag: "jump"; target: number }
  | { tag: "jumpIfZero"; target: number }
  | { tag: "call"; argCount: number; target: number }
  // TODO: call_closure
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

function assert<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing value");
  return value;
}

type HeapInternalValue =
  | { tag: "string"; value: string }
  | { tag: "object"; size: number }
  | { tag: "free" }
  | StackValue;

class Heap {
  private heap: HeapInternalValue[];
  constructor(constants: string[]) {
    // heap[0] is placeholder for null
    this.heap = [
      { tag: "primitive", value: 0 },
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
  set(address: number, offset: number, value: StackValue) {
    const idx = address + offset;
    if (idx >= this.heap.length) throw new Error("setting past allocated heap");
    this.heap[idx] = value;
  }
  // TODO: free, free list, garbage collection
  allocate(size: number): number {
    this.heap.push({ tag: "object", size });
    const addr = this.heap.length; // NOTE: pointing to first element, not header
    for (let i = 0; i < size; i++) {
      this.heap.push({ tag: "free" });
    }
    return addr;
  }
  toString(): string {
    return `[${this.heap
      .map((cell) => {
        switch (cell.tag) {
          case "object":
            return `(${cell.size})`;
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
  constructor(private program: Op[]) {}
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

export function interpret(data: { program: Op[]; constants: string[] }) {
  return Interpreter.interpret(data);
}

class Interpreter {
  static interpret(data: { program: Op[]; constants: string[] }) {
    const state = new Interpreter(data.program, data.constants);
    return state.runAll();
  }
  private stack: Stack = new Stack();
  private heap: Heap;
  private program: Program;
  private output: string[] = [];
  constructor(program: Op[], constants: string[]) {
    this.program = new Program(program);
    this.heap = new Heap(constants);
  }
  private write(value: string): void {
    this.output.push(value);
  }
  private runAll() {
    while (true) {
      const op = this.program.nextOp();
      // console.log(op, this.printStack(), this.heap.toString());
      if (op.tag === "halt") break;
      this.run(op);
    }
    return this.output;
  }
  private run(op: Op) {
    switch (op.tag) {
      case "load_immediate":
        this.stack.push(op.value);
        return;
      case "load_local":
        this.stack.push(this.stack.local(op.frameOffset));
        return;
      case "load_pointer_offset": {
        const addr = this.stack.pop().value;
        this.stack.push(this.heap.get(addr, op.offset));
        return;
      }
      case "drop":
        this.stack.pop();
        return;
      case "store_local":
        this.stack.setLocal(op.frameOffset, this.stack.pop());
        return;
      case "store_pointer_offset": {
        const value = this.stack.pop();
        const addr = this.stack.pop().value;
        this.heap.set(addr, op.offset, value);
        return;
      }
      case "new": {
        const addr = this.heap.allocate(op.size);
        this.stack.push({ tag: "pointer", value: addr });
        return;
      }
      case "jump": {
        this.program.jump(op.target);
        return;
      }
      case "jumpIfZero": {
        const predicate = this.stack.pop();
        if (predicate.value === 0) {
          this.program.jump(op.target);
        }
        return;
      }
      case "call": {
        this.stack.pushFrame(op.argCount, this.program.here());
        this.program.jump(op.target);
        return;
      }
      case "return":
        this.program.jump(this.stack.popFrame());
        return;
      case "add": {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value + right.value });
        return;
      }
      case "sub": {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value - right.value });
        return;
      }
      case "mod": {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push({ tag: "primitive", value: left.value % right.value });
        return;
      }
      case "print": {
        const value = this.stack.pop();
        switch (value.tag) {
          case "primitive":
            this.write(String(value.value));
            return;
          case "pointer":
            this.write(this.heap.getString(value.value));
            return;
          default:
            throw new Error();
        }
      }
      default:
        console.error(op);
        throw new Error("unknown opcode");
    }
  }
}
