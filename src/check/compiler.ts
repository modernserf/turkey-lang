import { Writer } from "../writer";
import { BlockScope } from "./types";

/*
compiler ideas
- best to check values in the order they should be on stack, but have some flexibility in order
  e.g. objects can be built in any order
- each func (and "main") should have their own writer, which are stitched together at end
- maybe still do a separate pass to collect type definitions before doing the compiler pass 
- block scope vars will need to track both stack offset & type
*/

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

export class Compiler {
  public scope!: BlockScope;
  private asm = new Writer();
  private strings = new InternedStringsState();
  primitive(value: number): void {
    this.asm.loadPrimitive(value);
  }
  string(value: string): void {
    this.asm.loadPointer(this.strings.use(value));
  }
  /*
  compiler.object(struct.size, (addField) => {
    for (const field of struct.fields) {
      addField(index, () => {
        compiler.primitive(field.value)
      })
    }
  })
  */
  object(
    size: number,
    onField: (fn: (index: number, cb: () => void) => void) => void
  ): void {
    this.asm.newObject(size);
    onField((index, cb) => {
      this.asm.dup();
      cb();
      this.asm.setHeap(index);
    });
  }
  identifier(value: string): void {
    const { stackOffset } = this.scope.getVar(value);
  }
}
