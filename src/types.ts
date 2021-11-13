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
  Halt,
  LoadPrimitive, // value
  LoadPointer, // value
  LoadLocal, // frameOffset
  LoadPointerOffset, // heapOffset
  StoreLocal, // frameOffset
  StorePointerOffset, // offset
  Dup,
  Drop,
  New, // size
  NewClosure, // size, target
  //
  Jump, // target
  JumpIfZero, // target
  Call, // arity, target
  CallClosure, // arity
  Return,
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
