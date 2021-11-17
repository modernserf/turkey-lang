// lexer -> parser

export type Token =
  | { tag: "let" }
  | { tag: "do" }
  | { tag: "if" }
  | { tag: "else" }
  | { tag: "while" }
  | { tag: "func" }
  | { tag: "return" }
  | { tag: "type" }
  | { tag: "enum" }
  | { tag: "struct" }
  | { tag: "match" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "typeIdentifier"; value: string }
  | { tag: "==" }
  | { tag: "!=" }
  | { tag: "<=" }
  | { tag: ">=" }
  | { tag: "=>" }
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
  | { tag: "type"; binding: TypeBinding; type: TypeExpr }
  | { tag: "enum"; binding: TypeBinding; cases: EnumCase[] }
  | { tag: "struct"; binding: TypeBinding; fields: StructFieldType[] }
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

export type EnumCase = { tagName: string; fields: StructFieldType[] };

export type StructFieldType = { fieldName: string; type: TypeExpr };
export type StructFieldValue = { fieldName: string; expr: Expr };
export type StructFieldBinding = { fieldName: string; binding: Binding };

export type Expr =
  | { tag: "identifier"; value: string }
  | { tag: "typeConstructor"; value: string; fields: StructFieldValue[] }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "closure"; parameters: Binding[]; block: Stmt[] }
  | { tag: "binaryOp"; left: Expr; right: Expr; operator: string }
  | { tag: "unaryOp"; expr: Expr; operator: string }
  | { tag: "do"; block: Stmt[] }
  | { tag: "if"; cases: IfCase[]; elseBlock: Stmt[] }
  | { tag: "match"; expr: Expr; cases: MatchCase[] }
  | { tag: "field"; expr: Expr; fieldName: string }
  | { tag: "call"; expr: Expr; args: Expr[] };

export type IfCase = { tag: "cond"; predicate: Expr; block: Stmt[] };

export type MatchCase = { binding: MatchBinding; block: Stmt[] };
export type MatchBinding = {
  tag: "typeIdentifier";
  value: string;
  fields: StructFieldBinding[];
};

export type Binding =
  | { tag: "identifier"; value: string }
  | { tag: "struct"; fields: StructFieldBinding[] };

export type TypeExpr =
  | { tag: "identifier"; value: string }
  | { tag: "func"; parameters: TypeExpr[]; returnType: TypeExpr };

export type TypeBinding = { tag: "identifier"; value: string };

// typechecker -> compiler

export type Type =
  | { tag: "void" }
  | { tag: "integer" }
  | { tag: "float" }
  | { tag: "string" }
  | {
      tag: "enum";
      value: symbol;
      cases: Map<
        string,
        {
          index: number;
          fields: Map<string, CheckedStructFieldType>;
        }
      >;
    }
  | {
      tag: "struct";
      value: symbol;
      fields: Map<string, CheckedStructFieldType>;
    }
  | { tag: "func"; parameters: Type[]; returnType: Type };

type CheckedStructFieldType = { type: Type; index: number };

export type CheckedExpr =
  | { tag: "primitive"; value: number; type: Type }
  | { tag: "string"; value: string; type: Type }
  | { tag: "enum"; index: number; fields: CheckedExpr[]; type: Type }
  | { tag: "struct"; value: CheckedExpr[]; type: Type }
  | { tag: "identifier"; value: string; type: Type }
  | {
      tag: "closure";
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: Type;
    }
  | { tag: "field"; expr: CheckedExpr; index: number; type: Type }
  | { tag: "callBuiltIn"; opcode: Opcode; args: CheckedExpr[]; type: Type }
  | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[]; type: Type }
  | { tag: "do"; block: CheckedStmt[]; type: Type }
  | {
      tag: "if";
      cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
      elseBlock: CheckedStmt[];
      type: Type;
    }
  | {
      tag: "match";
      expr: CheckedExpr;
      cases: Map<
        string,
        {
          index: number;
          bindings: CheckedStructFieldBinding[];
          block: CheckedStmt[];
        }
      >;
      type: Type;
    };

export type CheckedStmt =
  | { tag: "let"; binding: CheckedBinding; expr: CheckedExpr }
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

export type CheckedBinding =
  | { tag: "identifier"; value: string }
  | { tag: "struct"; fields: CheckedStructFieldBinding[] };

export type CheckedStructFieldBinding = {
  fieldIndex: number;
  binding: CheckedBinding;
};

export type CheckedParam = { binding: CheckedBinding; type: Type };
export type CheckedUpvalue = { name: string; type: Type };

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
