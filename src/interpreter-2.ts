export interface InterpreterState {
  stack: Stack;
  heap: Heap;
  ip: InstructionState;
}

class InstructionState {
  private ip = 0;
  constructor(private program: DataView) {}
  jumpAbsolute(address: number): void {
    this.ip = address;
  }
  jumpRelative(offset: number): void {
    this.ip += offset;
  }
  next(): number {
    return this.program.getUint8(this.ip++);
  }
  next16(): number {
    const res = this.program.getInt16(this.ip);
    this.ip += 2;
    return res;
  }
  next32(): number {
    const res = this.program.getInt32(this.ip);
    this.ip += 4;
    return res;
  }
  here(): number {
    return this.ip;
  }
}

class Stack {
  private top = 0;
  private frameOffset = 0;
  private data: number[];
  constructor(stackSize: number) {
    this.data = Array(stackSize).fill(0);
  }
  push(value: number): void {
    this.data[this.top++] = value;
  }
  pop(): number {
    return this.data[--this.top];
  }
  dup(): void {
    this.data[this.top] = this.data[this.top - 1]
    this.top++
  }
  drop(count: number): void {
    this.top -= count
  }
  frame(): void {
    this.data[this.top] = this.frameOffset
    this.frameOffset = this.top
    this.top++
  }
  getLocal(offset: number): number {
    return this.data[offset + this.frameOffset]
  }
  setLocal(offset: number, value: number): void {
    this.data[offset + this.frameOffset] = value
  }
  popFrame(): number {
    const returnValue = this.data[this.top - 1]
    this.top = this.data[this.frameOffset]
    this.frameOffset = this.data[this.top]
    return returnValue
  }
}

class HeapBlock {
  constructor (offset: number, )
}

class Heap {
  private data: DataView
  private freePtr: number
  constructor(constants: ArrayBuffer) {
    this.data = new DataView(new ArrayBuffer(4096))
    // copy constants onto buffer
    const dataBytes = new Uint8Array(this.data.buffer)
    dataBytes.set(new Uint8Array(constants), 0)
    this.freePtr = constants.byteLength
    this.writeBlockHeader(this.freePtr, this.data.byteLength - this.freePtr, 0)
  }

  private writeBlockHeader(at: number, size: number, next: number) {
    this.data.setUint32(at, 0)
    this.data.setUint32(at + 4, size)
    this.data.setUint32(at + 8, next)
  }
  private allocate(size: number) {
    let ptr = this.freePtr
    while (ptr !== 0) {
      const thisBlockSize = this.data.getUint32(ptr + 4)
      if (thisBlockSize >)
    }
  }
}

// prettier-ignore
export enum Opcode {
  // 0x00 - 0x0F put that value on the stack

  Halt = 0x10,
  Jump = 0x11, // u32: address
  JumpIfZero = 0x12, // u32: address | ( value -- )
  JumpLocal = 0x13, // i8: offset
  JumpLocalIfZero = 0x14, // i8: offset | ( value -- )
  JumpComputed = 0x15, // (u32 address -- )
  JumpLocalComputed = 0x16, // (i32 offset -- )

  Call = 0x1A,    //                  | (address -- return_address prev_frame)
  Return = 0x1B,//     u8: args count | (...args return_address prev_frame ... value -- value)

  Static = 0x20,      // u32: address | ( -- value)
  Deref = 0x21,       //              | (address -- value)
  Field = 0x22,       // u8: offset   | (address -- value)
  StaticArray = 0x23, // u32: address | (offset -- value)
  Local = 0x24,       // i16: offset  | ( -- value)
  Dup = 0x25,         //              | (value -- value value)

  Drop = 0x30,        //              | (value -- )
  DropN = 0x31,       // u8: count    | (value -- )
  SetStatic = 0x32,   // u32: address | (value -- )
  SetRef = 0x33,      //              | (value address -- )
  SetField = 0x34,    // u8: offset   | (value address -- )
  SetStatArr = 0x35,  // u32: address | (value offset -- )
  SetHeap = 0x36,     //              | (value -- )
  SetLocal = 0x37,    // i16: offset  | ( -- value)

  Add = 0x40, // (int int -- int)
  Sub = 0x41, // (int int -- int)
  Mul = 0x42, // (int int -- int)
  Div = 0x43, // (int int -- float)
  Neg = 0x44, // (int -- int)
  Mod = 0x45, // (int int -- int)

  Print = 0xA0, // (*string -- )
  IntToString = 0xA1 // (int -- *string)
}

export function run1(state: InterpreterState) {
  const instruction = state.ip.next();
  if (instruction < 0x10) {
    state.stack.push(instruction)
    return;
  }
  switch (instruction) {
    case Opcode.Jump: {
      const addr = state.ip.next32();
      state.ip.jumpAbsolute(addr)
      return
    }
    case Opcode.JumpIfZero: {
      const addr = state.ip.next32();
      const predicate = state.stack.pop();
      if (predicate === 0) {
        state.ip.jumpAbsolute(addr);
      }
      return
    }
    case Opcode.Call: {
      const addr = state.stack.pop()
      state.stack.push(state.ip.here());
      state.stack.frame();
      state.ip.jumpAbsolute(addr);
      return
    }
    case Opcode.Return: {
      const argsCount = state.ip.next();
      const returnValue = state.stack.popFrame()
      const returnAddress = state.stack.pop()
      state.stack.drop(argsCount);
      state.stack.push(returnValue);
      state.ip.jumpAbsolute(returnAddress);
      return
    }
  }
}

