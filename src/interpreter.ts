import { Opcode } from "./types";

function assert<T>(value: T | undefined): T {
  // istanbul ignore next
  if (value === undefined) throw new Error("missing value");
  return value;
}

type StackValue = number & { __brand: "stack" };
function isStackValue(value: HeapInternalValue): value is StackValue {
  return typeof value === "number";
}

const MASK = 0x00ff_ffff;

// istanbul ignore next
function printStackValue(value: StackValue): string {
  if (value > MASK) return `0x${getAddress(value).toString(16)}`;
  return String(value);
}

function getAddress(value: StackValue): number {
  return value & MASK;
}

function createAddress(offset: number): StackValue {
  // istanbul ignore next
  if (offset > MASK) throw new Error("out of 24-bit addresses");
  return (offset | (MASK + 1)) as StackValue;
}

type HeapInternalValue =
  | { tag: "string"; value: string }
  | { tag: "object"; size: number }
  | { tag: "closure"; size: number; target: number }
  | { tag: "free" }
  | StackValue;

class Heap {
  private _heap: HeapInternalValue[];
  constructor(constants: string[]) {
    // heap[0] is placeholder for null
    this._heap = [
      { tag: "free" },
      ...constants.map((str) => ({ tag: "string" as const, value: str })),
    ];
  }
  private _get(address: StackValue, offset: number): HeapInternalValue {
    return assert(this._heap[getAddress(address) + offset]);
  }
  private _push(value: HeapInternalValue): StackValue {
    this._heap.push(value);
    return createAddress(this._heap.length);
  }
  private _set(address: StackValue, offset: number, value: HeapInternalValue) {
    const idx = getAddress(address) + offset;
    // istanbul ignore next
    if (idx >= this._heap.length) {
      throw new Error("setting past allocated heap");
    }
    this._heap[idx] = value;
  }
  get(address: StackValue, offset: number): StackValue {
    const res = this._get(address, offset);
    if (isStackValue(res)) return res;
    // istanbul ignore next
    throw new Error("illegal memory access");
  }
  getString(address: StackValue): string {
    const res = this._get(address, 0);
    // istanbul ignore next
    if (isStackValue(res) || res.tag !== "string") throw new Error();
    return res.value;
  }
  getClosureTarget(address: StackValue): number {
    const res = this._get(address, -1); // -1 to get header from ptr to first item
    // istanbul ignore next
    if (isStackValue(res) || res.tag !== "closure") throw new Error();
    return res.target;
  }
  set(address: StackValue, offset: number, value: StackValue) {
    this._set(address, offset, value);
  }
  // TODO: free, free list, garbage collection
  object(size: number): StackValue {
    const addr = this._push({ tag: "object", size });
    for (let i = 0; i < size; i++) {
      this._push({ tag: "free" });
    }
    return addr;
  }
  closure(size: number, target: number): StackValue {
    const addr = this._push({ tag: "closure", size, target });
    for (let i = 0; i < size; i++) {
      this._push({ tag: "free" });
    }
    return addr;
  }
  // istanbul ignore next
  toString(): string {
    return `[${this._heap
      .map((cell) => {
        if (isStackValue(cell)) {
          return printStackValue(cell);
        }

        switch (cell.tag) {
          case "object":
            return `(${cell.size})`;
          case "closure":
            return `(${cell.size},${cell.target})`;
          case "string":
            return `"${cell.value}"`;
          case "free":
            return "_";
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
  popFrameVoid(): number {
    this.stack.length = this.frame.offset;
    const returnAddress = this.frame.returnAddress;
    this.frame = assert(this.frame.next);
    return returnAddress;
  }
  // istanbul ignore next
  toString(): string {
    return `[${this.stack.map(printStackValue).join(" ")}]`;
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
  jumpTable(offset: number) {
    const tableValue = this.program[this.ip + offset];
    this.ip += tableValue;
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
        this.stack.push(this.program.nextOp() as StackValue);
        return;
      case Opcode.LoadPointer:
        this.stack.push(createAddress(this.program.nextOp()));
        return;
      case Opcode.LoadLocal:
        this.stack.push(this.stack.local(this.program.nextOp()));
        return;
      case Opcode.LoadPointerOffset: {
        const addr = this.stack.pop();
        this.stack.push(this.heap.get(addr, this.program.nextOp()));
        return;
      }
      case Opcode.Dup:
        this.stack.push(this.stack.peek());
        return;
      case Opcode.Drop:
        this.stack.pop();
        return;
      case Opcode.StoreLocal:
        this.stack.setLocal(this.program.nextOp(), this.stack.pop());
        return;
      case Opcode.StorePointerOffset: {
        const value = this.stack.pop();
        const addr = this.stack.pop();
        this.heap.set(addr, this.program.nextOp(), value);
        return;
      }
      case Opcode.New: {
        const size = this.program.nextOp();
        const addr = this.heap.object(size);
        this.stack.push(addr);
        return;
      }
      case Opcode.NewClosure: {
        const size = this.program.nextOp();
        const target = this.program.nextOp();
        const addr = this.heap.closure(size, target);
        this.stack.push(addr);
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
        if (predicate === 0) this.program.jump(target);
        return;
      }
      case Opcode.JumpTable: {
        let offset = this.stack.pop();
        if (offset > 255 || offset < 0) {
          offset = this.heap.get(offset, 0);
        }
        this.program.jumpTable(offset);
        return;
      }
      case Opcode.CallClosure: {
        const arity = this.program.nextOp();
        const ptr = this.stack.peek(); // leave closure ptr on stack to pass as additional arg
        const target = this.heap.getClosureTarget(ptr);
        this.stack.pushFrame(arity + 1, this.program.here());
        this.program.jump(target);
        return;
      }
      case Opcode.ReturnValue:
        this.program.jump(this.stack.popFrame());
        return;
      case Opcode.ReturnVoid:
        this.program.jump(this.stack.popFrameVoid());
        return;
      case Opcode.Not: {
        const value = this.stack.pop();
        this.stack.push((value === 0 ? 1 : 0) as StackValue);
        return;
      }
      case Opcode.Neg: {
        const value = this.stack.pop();
        this.stack.push(-value as StackValue);
        return;
      }
      case Opcode.Add: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push((left + right) as StackValue);
        return;
      }
      case Opcode.Sub: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push((left - right) as StackValue);
        return;
      }
      case Opcode.Mod: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push((left % right) as StackValue);
        return;
      }
      case Opcode.Gt: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push(Number(left > right) as StackValue);
        return;
      }
      case Opcode.Lt: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push(Number(left < right) as StackValue);
        return;
      }
      case Opcode.Eq: {
        const right = this.stack.pop();
        const left = this.stack.pop();
        this.stack.push(Number(left === right) as StackValue);
        return;
      }
      case Opcode.PrintStr: {
        const value = this.stack.pop();
        this.write(this.heap.getString(value));
        return;
      }
      case Opcode.PrintNum: {
        const value = this.stack.pop();
        this.write(String(value));
        return;
      }
      // istanbul ignore next
      default:
        console.error(Opcode[op]);
        throw new Error("unknown opcode");
    }
  }
}
