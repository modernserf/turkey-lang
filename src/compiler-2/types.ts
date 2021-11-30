export type Builtin =
  | "add"
  | "sub"
  | "lt"
  | "eq"
  | "mod"
  | "print_num"
  | "print_string";

export type IRExpr =
  | { tag: "primitive"; value: number }
  | { tag: "string"; value: string }
  | { tag: "object"; value: IRExpr[] }
  | { tag: "ident"; value: symbol }
  | { tag: "recur" }
  | {
      tag: "func";
      upvalues: Array<{ binding: symbol; expr: IRExpr }>;
      parameters: symbol[];
      block: IRStmt[];
    }
  | { tag: "call"; callee: IRExpr; args: IRExpr[]; hasValue: boolean }
  | { tag: "builtin"; value: Builtin; args: IRExpr[] }
  | { tag: "field"; target: IRExpr; index: number }
  | { tag: "do"; block: IRStmt[] }
  | {
      tag: "if";
      ifCases: Array<{ expr: IRExpr; block: IRStmt[] }>;
      elseBlock: IRStmt[];
    }
  | {
      tag: "match";
      expr: IRExpr;
      binding: symbol;
      matchCases: Array<{ index: number; block: IRStmt[] }>;
    };

export type IRStmt =
  | { tag: "expr"; expr: IRExpr }
  | { tag: "let"; binding: symbol; expr: IRExpr }
  | { tag: "for"; binding: symbol; expr: IRExpr; block: IRStmt[] }
  | { tag: "while"; expr: IRExpr; block: IRStmt[] }
  | { tag: "return"; expr: IRExpr | null };
