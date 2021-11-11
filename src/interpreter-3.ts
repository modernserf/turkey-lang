class StackFrame {
  constructor(
    public locals: StackValue[],
    public readonly returnAddress: number
  ) {}
}

type StackValue =
  | { tag: "primitive"; value: number }
  | { tag: "pointer"; value: number };

type LoadSource =
  | { tag: "immediate"; value: StackValue } // ( -- value)
  | { tag: "local"; frameOffset: number } // ( -- value)
  | { tag: "pointer_offset"; offset: number }
  | { tag: "dup" }; // (value -- value value)

type StoreDestination =
  | { tag: "drop" } // (value -- )
  | { tag: "local"; frameOffset: number } // (value -- )
  | { tag: "pointer_offset"; offset: number };

export type Op =
  | { tag: "halt" }
  | { tag: "load"; from: LoadSource }
  | { tag: "store"; to: StoreDestination }
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

export function interpret(data: { program: Op[]; constants: string[] }) {
  const state = new InterpreterState(data.program, data.constants);
  runAll(state);
  return state.getOutput();
}

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

class InterpreterState {
  private stack: StackFrame[];
  heap: Heap;
  private ip = 0;
  private output: string[] = [];
  constructor(private program: Op[], constants: string[]) {
    this.stack = [new StackFrame([], 0)];
    this.heap = new Heap(constants);
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
    if (!value) throw new Error("missing value");
    this.frame().locals.push(value);
  }
  pop(): StackValue {
    return assert(this.frame().locals.pop());
  }
  local(offset: number): StackValue {
    return this.frame().locals[offset];
  }
  setLocal(offset: number, value: StackValue) {
    this.frame().locals[offset] = value;
  }

  pushFrame(argCount: number) {
    const args = this.frame().locals.splice(-argCount, argCount);
    const returnAddress = this.ip;
    this.stack.push(new StackFrame(args, returnAddress));
  }
  popFrame() {
    const prevFrame = assert(this.stack.pop());
    const result = assert(prevFrame.locals.pop());
    const returnAddress = prevFrame.returnAddress;
    this.push(result);
    this.jump(returnAddress);
  }
  write(value: string) {
    this.output.push(value);
  }

  printStack(): string {
    return `[${this.stack
      .map((frame) =>
        frame.locals
          .map((local) => {
            switch (local.tag) {
              case "primitive":
                return String(local.value);
              case "pointer":
                return `0x${local.value.toString(16)}`;
            }
          })
          .join(" ")
      )
      .join(" | ")}]`;
  }
}

function runAll(state: InterpreterState) {
  while (true) {
    const op = state.nextOp();
    // console.log(op, state.printStack(), state.heap.toString());
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
        case "pointer_offset": {
          const addr = state.pop().value;
          state.push(state.heap.get(addr, op.from.offset));
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
        case "pointer_offset": {
          const value = state.pop();
          const offset = op.to.offset;
          const addr = state.pop().value;
          state.heap.set(addr, offset, value);
          return;
        }
        default:
          throw new Error();
      }
    case "new": {
      const addr = state.heap.allocate(op.size);
      state.push({ tag: "pointer", value: addr });
      return;
    }
    case "jump": {
      state.jump(op.target);
      return;
    }
    case "jumpIfZero": {
      const predicate = state.pop();
      if (predicate.value === 0) {
        state.jump(op.target);
      }
      return;
    }
    case "call": {
      state.pushFrame(op.argCount);
      state.jump(op.target);
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
          state.write(state.heap.getString(value.value));
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
