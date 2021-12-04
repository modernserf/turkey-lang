export enum Opcode {
  Halt,
  LoadPrimitive, // value
  LoadPointer, // value
  LoadRoot, // root offset
  StoreRoot, // root offset
  LoadLocal, // frameOffset
  StoreLocal, // frameOffset
  LoadField, // heapOffset
  StoreField, // offset
  LoadIndex,
  StoreIndex,
  Dup,
  Drop,
  New, // size
  NewClosure, // size, target
  NewArray,
  //
  Jump, // target
  JumpIfZero, // target
  JumpTable, // ...offsets
  CallClosure, // arity
  ReturnValue,
  ReturnVoid,

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
  PrintNum,
  PrintStr,
}
