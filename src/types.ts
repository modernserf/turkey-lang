// lexer -> parser

export type Token =
  | { tag: "print" }
  | { tag: "let" }
  | { tag: "do" }
  | { tag: "if" }
  | { tag: "else" }
  | { tag: "while" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "identifier"; value: string }
  | { tag: "typeIdentifier"; value: string }
  | { tag: "==" }
  | { tag: "!=" }
  | { tag: "<=" }
  | { tag: ">=" }
  | { tag: "!" }
  | { tag: "+" }
  | { tag: "-" }
  | { tag: "*" }
  | { tag: "/" }
  | { tag: "%" }
  | { tag: "=" }
  | { tag: "<" }
  | { tag: ">" }
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
  | { tag: "while"; expr: Expr; block: Stmt[] }
  | { tag: "expr"; expr: Expr };

export type Expr =
  | { tag: "identifier"; value: string }
  | { tag: "typeConstructor"; value: string }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "binaryOp"; left: Expr; right: Expr; operator: string }
  | { tag: "unaryOp"; expr: Expr; operator: string }
  | { tag: "do"; block: Stmt[] }
  | { tag: "if"; cases: IfCase[]; elseBlock: Stmt[] };

export type IfCase = { tag: "cond"; predicate: Expr; block: Stmt[] };

export type Binding = { tag: "identifier"; value: string };

// compiler -> interpreter

export enum Opcode {
  Halt = 0x00,
  Constant = 0x01, // (index: u8)
  IntImmediate = 0x02, // (value: i8)
  Print = 0x10,
  AddInt = 0x20,
  SubInt = 0x21,
  MulInt = 0x22,
  DivInt = 0x23,
  ModInt = 0x24,
  NegInt = 0x25,
  BitNot = 0x26,
  BitAnd = 0x27,
  BitOr = 0x28,
  BitXor = 0x29,
  Eq = 0x2a,
  Cmp = 0x2b,

  GetLocal = 0x30, // (index: u8)
  // SetLocal = 0x31,
  PushScope = 0x40,
  PopScope = 0x41,
  PopScopeVoid = 0x42,
  Drop = 0x43,
  Jump = 0x50, // (address: u32)
  JumpIfZero = 0x51, // (address: u32)

  //
  AddFloat = 0xf0,
  SubFloat = 0xf1,
  MulFloat = 0xf2,
  DivFloat = 0xf3,
  NegFloat = 0xf4,
}

export interface CompileResult {
  constants: any[];
  program: Uint8Array;
}
