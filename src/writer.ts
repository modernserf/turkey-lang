import { Opcode } from "./types";

export class Writer {
  private program: number[] = [];
  compile(): number[] {
    return this.program;
  }
  nextIndex(): number {
    return this.program.length;
  }
  writeOpcode(opcode: Opcode): this {
    this.program.push(opcode);
    return this;
  }
  patchAddress(index: number, addr: number): void {
    switch (this.program[index]) {
      case Opcode.Jump:
        this.patchJump(index, addr);
        return;
      case Opcode.JumpIfZero:
        this.patchJumpIfZero(index, addr);
        return;
      case Opcode.NewClosure:
        this.patchNewClosure(index, addr);
        return;
      // istanbul ignore next
      default:
        throw new Error();
    }
  }
  halt(): this {
    this.program.push(Opcode.Halt);
    return this;
  }
  loadPrimitive(value: number): this {
    this.program.push(Opcode.LoadPrimitive, value);
    return this;
  }
  loadPointer(pointer: number): this {
    this.program.push(Opcode.LoadPointer, pointer);
    return this;
  }
  dup(): this {
    this.program.push(Opcode.Dup);
    return this;
  }
  drop(): this {
    this.program.push(Opcode.Drop);
    return this;
  }
  loadLocal(frameOffset: number): this {
    this.program.push(Opcode.LoadLocal, frameOffset);
    return this;
  }
  setLocal(frameOffset: number): this {
    this.program.push(Opcode.StoreLocal, frameOffset);
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
  newObject(size: number): this {
    this.program.push(Opcode.New, size);
    return this;
  }
  newClosure(count: number, addr = 0): this {
    this.program.push(Opcode.NewClosure, count, addr);
    return this;
  }
  private patchNewClosure(index: number, addr: number) {
    this.program[index + 2] = addr;
    return this;
  }
  jump(addr = 0): this {
    this.program.push(Opcode.Jump, addr);
    return this;
  }
  private patchJump(index: number, addr: number): this {
    this.program[index + 1] = addr;
    return this;
  }
  jumpIfZero(addr = 0): this {
    this.program.push(Opcode.JumpIfZero, addr);
    return this;
  }
  private patchJumpIfZero(index: number, addr: number): this {
    this.program[index + 1] = addr;
    return this;
  }
  callClosure(arity: number): this {
    this.program.push(Opcode.CallClosure, arity);
    return this;
  }
  return(): this {
    this.program.push(Opcode.ReturnValue);
    return this;
  }
  returnVoid(): this {
    this.program.push(Opcode.ReturnVoid);
    return this;
  }
}
