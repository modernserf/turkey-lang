import { Opcode, CompileResult } from "./types";

export function interpret(input: CompileResult) {
  return Interpreter.interpret(input);
}

class Interpreter {
  static interpret(input: CompileResult) {
    return new Interpreter(input).output;
  }
  private instructionPointer = 0;
  private framePointer = 0;
  private output: any[] = [];
  private stack: any[] = [];
  constructor(private input: CompileResult) {
    this.runAll();
  }
  private next() {
    return this.input.program[this.instructionPointer++];
  }
  private write(out: any) {
    this.output.push(out);
  }
  private push(value: any) {
    this.stack.push(value);
  }
  private pop(): any {
    return this.stack.pop();
  }
  private runAll() {
    while (true) {
      const opcode = this.next();
      if (opcode === Opcode.Halt) break;
      this.run(opcode);
    }
  }
  private run(opcode: Opcode) {
    switch (opcode) {
      case Opcode.Constant: {
        const index = this.next();
        this.push(this.input.constants[index]);
        return;
      }
      case Opcode.IntImmediate: {
        const asUnsigned8 = this.next();
        const asSigned32 = asUnsigned8 > 127 ? asUnsigned8 | -256 : asUnsigned8;
        this.push(asSigned32);
        return;
      }
      case Opcode.Drop: {
        this.pop();
        return;
      }
      case Opcode.Print: {
        const value = this.pop();
        this.write(value);
        return;
      }
      case Opcode.AddInt:
      case Opcode.AddFloat: {
        const right = this.pop();
        const left = this.pop();
        this.push(left + right);
        return;
      }
      case Opcode.SubInt:
      case Opcode.SubFloat: {
        const right = this.pop();
        const left = this.pop();
        this.push(left - right);
        return;
      }
      case Opcode.MulInt:
      case Opcode.MulFloat: {
        const right = this.pop();
        const left = this.pop();
        this.push(left * right);
        return;
      }
      case Opcode.DivInt:
      case Opcode.DivFloat: {
        const right = this.pop();
        const left = this.pop();
        this.push(left / right);
        return;
      }
      case Opcode.InitLocal: {
        // do nothing, leave the current value on the stack at this position
        return;
      }
      case Opcode.GetLocal: {
        const index = this.next();
        this.push(this.stack[index]);
        return;
      }
      case Opcode.PushScope: {
        const nextFramePointer = this.stack.length;
        this.push(this.framePointer);
        this.framePointer = nextFramePointer;
        return;
      }
      case Opcode.PopScope: {
        const returnVal = this.pop();
        const prevFramePointer = this.stack[this.framePointer];
        this.stack.length = this.framePointer;
        this.framePointer = prevFramePointer;
        this.push(returnVal);
        return;
      }
      case Opcode.PopScopeVoid: {
        const prevFramePointer = this.stack[this.framePointer];
        this.stack.length = this.framePointer;
        this.framePointer = prevFramePointer;
        return;
      }
      // istanbul ignore next
      default: {
        throw new Error("Illegal opcode");
      }
    }
  }
}
