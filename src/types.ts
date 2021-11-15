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
  | { tag: "string"; value: string }
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
  | { tag: "|" }
  | { tag: "endOfInput" };

// parser -> typechecker

export class ParseError extends Error {
  constructor(expected: string, received: Token) {
    super(`expected ${expected}, received ${received.tag}`);
  }
}

export type Stmt =
  | { tag: "print"; expr: Expr }
  | { tag: "let"; binding: Binding; type: TypeExpr | null; expr: Expr }
  | { tag: "while"; expr: Expr; block: Stmt[] }
  | { tag: "return"; expr: Expr | null }
  | {
      tag: "func";
      name: string;
      parameters: Array<{ binding: Binding; type: TypeExpr }>;
      returnType: TypeExpr;
      block: Stmt[];
    }
  | { tag: "expr"; expr: Expr };

export type Expr =
  | { tag: "identifier"; value: string }
  | { tag: "typeConstructor"; value: string }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "closure"; parameters: Binding[]; block: Stmt[] }
  | { tag: "binaryOp"; left: Expr; right: Expr; operator: string }
  | { tag: "unaryOp"; expr: Expr; operator: string }
  | { tag: "do"; block: Stmt[] }
  | { tag: "if"; cases: IfCase[]; elseBlock: Stmt[] }
  | { tag: "call"; expr: Expr; args: Expr[] };

export type IfCase = { tag: "cond"; predicate: Expr; block: Stmt[] };

export type Binding = { tag: "identifier"; value: string };

export type TypeExpr =
  | { tag: "identifier"; value: string }
  | { tag: "func"; parameters: TypeExpr[]; returnType: TypeExpr };

// typechecker -> compiler

export type Type =
  | { tag: "void" }
  | { tag: "integer" }
  | { tag: "float" }
  | { tag: "string" }
  | { tag: "struct"; value: string }
  | { tag: "func"; parameters: Type[]; returnType: Type };

export type CheckedExpr =
  | { tag: "primitive"; value: number; type: Type }
  | { tag: "string"; value: string; type: Type }
  | { tag: "identifier"; value: string; type: Type }
  | {
      tag: "closure";
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: Type;
    }
  | { tag: "callBuiltIn"; opcode: Opcode; args: CheckedExpr[]; type: Type }
  | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[]; type: Type }
  | { tag: "do"; block: CheckedStmt[]; type: Type }
  | {
      tag: "if";
      cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
      elseBlock: CheckedStmt[];
      type: Type;
    };

export type CheckedStmt =
  | { tag: "let"; binding: Binding; expr: CheckedExpr }
  | { tag: "return"; expr: CheckedExpr | null }
  | {
      tag: "func";
      name: string;
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: Type;
    }
  | { tag: "while"; expr: CheckedExpr; block: CheckedStmt[] }
  | { tag: "expr"; expr: CheckedExpr };

type CheckedParam = { binding: Binding; type: Type };
type CheckedUpvalue = { name: string; type: Type };

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
