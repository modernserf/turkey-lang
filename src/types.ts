// lexer -> parser

export type Token =
  | { tag: "print" }
  | { tag: "let" }
  | { tag: "do" }
  | { tag: "if" }
  | { tag: "else" }
  | { tag: "while" }
  | { tag: "func" }
  | { tag: "return" }
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
  | { tag: ":" }
  | { tag: "," }
  | { tag: "endOfInput" };

// parser -> compiler

export class ParseError extends Error {
  constructor(expected: string, received: Token) {
    super(`expected ${expected}, received ${received.tag}`);
  }
}

export type Stmt =
  | { tag: "print"; expr: Expr }
  | { tag: "let"; binding: Binding; type: Type | null; expr: Expr }
  | { tag: "while"; expr: Expr; block: Stmt[] }
  | { tag: "return"; expr: Expr | null }
  | {
      tag: "func";
      name: string;
      parameters: Array<{ binding: Binding; type: Type }>;
      returnType: Type;
      block: Stmt[];
      environment?: string[];
      pointer?: symbol;
    }
  | { tag: "expr"; expr: Expr };

export type Expr =
  | { tag: "identifier"; value: string }
  | { tag: "typeConstructor"; value: string }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "binaryOp"; left: Expr; right: Expr; operator: string }
  | { tag: "unaryOp"; expr: Expr; operator: string }
  | { tag: "do"; block: Stmt[] }
  | { tag: "if"; cases: IfCase[]; elseBlock: Stmt[] }
  | { tag: "call"; expr: Expr; args: Expr[] };

export type IfCase = { tag: "cond"; predicate: Expr; block: Stmt[] };

export type Binding = { tag: "identifier"; value: string };

export type Type = { tag: "identifier"; value: string };

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
