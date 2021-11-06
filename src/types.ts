// lexer -> parser

export type Token =
  | { tag: "print" }
  | { tag: "let" }
  | { tag: "do" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "identifier"; value: string }
  | { tag: "typeIdentifier"; value: string }
  | { tag: "+" }
  | { tag: "-" }
  | { tag: "*" }
  | { tag: "/" }
  | { tag: "=" }
  | { tag: "(" }
  | { tag: ")" }
  | { tag: "{" }
  | { tag: "}" }
  | { tag: "endOfInput" };

// parser -> compiler

export class ParseError extends Error {
  constructor(expected: string, received: Token) {
    super(`expected ${expected}, received ${received.tag}`);
  }
}

export type Stmt =
  | { tag: "print"; expr: Expr }
  | { tag: "let"; binding: Binding; type: null; expr: Expr }
  | { tag: "expr"; expr: Expr };

export type Expr =
  | { tag: "identifier"; value: string }
  | { tag: "typeConstructor"; value: string }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "binaryOp"; left: Expr; right: Expr; operator: string }
  | { tag: "do"; block: Stmt[] };

export type Binding = { tag: "identifier"; value: string };

// compiler -> interpreter

export enum Opcode {
  Halt = 0x00,
  Constant = 0x01, // (index: u8)
  IntImmediate = 0x02, // (value: i8)
  Print = 0x10,
  AddInt = 0x20,
  AddFloat = 0x21,
  SubInt = 0x22,
  SubFloat = 0x23,
  MulInt = 0x24,
  MulFloat = 0x25,
  DivInt = 0x26,
  DivFloat = 0x27,
  InitLocal = 0x30,
  GetLocal = 0x31, // (index: u8)
  // SetLocal = 0x32,
  PushScope = 0x40,
  PopScope = 0x41,
  PopScopeVoid = 0x42,
  Drop = 0x43,
}

export interface CompileResult {
  constants: any[];
  program: Uint8Array;
}
