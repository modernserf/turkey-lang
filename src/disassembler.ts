import { Opcode } from "./opcode";

export function disassembler(code: number[]): string {
  let byte: Opcode | undefined;
  const result: string[] = [];
  while (((byte = code.shift()), byte !== undefined)) {
    switch (byte) {
      case Opcode.LoadPrimitive:
      case Opcode.LoadPointer:
      case Opcode.LoadRoot:
      case Opcode.StoreRoot:
      case Opcode.LoadLocal:
      case Opcode.StoreLocal:
      case Opcode.StorePointerOffset:
      case Opcode.New:
      case Opcode.Jump:
      case Opcode.JumpIfZero:
      case Opcode.CallClosure: {
        const next = code.shift();
        result.push(`${Opcode[byte]} ${next}`);
        break;
      }
      case Opcode.NewClosure: {
        const a = code.shift();
        const b = code.shift();
        result.push(`${Opcode[byte]} ${a} ${b}`);
        break;
      }
      case Opcode.JumpTable: {
        const size = code.shift() as number;
        let out = `${size}`;
        for (let i = 0; i < size; i++) {
          out += `, ${code.shift()}`;
        }

        result.push(`${Opcode[byte]} [${out}]`);
        break;
      }
      default: {
        const name = Opcode[byte];
        if (name) {
          result.push(name);
        } else {
          result.push(String(byte));
        }
      }
    }
  }
  return result.join("\n");
}
