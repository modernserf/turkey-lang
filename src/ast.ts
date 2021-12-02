export type Stmt =
  | { tag: "type"; binding: TypeBinding; type: TypeExpr }
  | { tag: "enum"; binding: TypeBinding; cases: EnumCase[] }
  | {
      tag: "struct";
      binding: TypeBinding;
      fields: StructFieldType[];
      isTuple: boolean;
    }
  | { tag: "let"; binding: Binding; type: TypeExpr | null; expr: Expr }
  | { tag: "while"; expr: Expr; block: Stmt[] }
  | { tag: "for"; binding: Binding; expr: Expr; block: Stmt[] }
  | { tag: "return"; expr: Expr | null }
  | {
      tag: "func";
      name: string;
      typeParameters: TypeParam[];
      parameters: Array<{ binding: Binding; type: TypeExpr }>;
      returnType: TypeExpr;
      block: Stmt[];
    }
  | { tag: "trait"; binding: TypeBinding; fields: TraitField[] }
  | {
      tag: "impl";
      typeParameters: TypeParam[];
      trait: TypeExpr;
      target: TypeExpr;
      block: Stmt[];
    }
  | { tag: "expr"; expr: Expr };

export type EnumCase = {
  tagName: string;
  fields: StructFieldType[];
  isTuple: boolean;
};

export type StructFieldType = { fieldName: string; type: TypeExpr };
export type StructFieldValue = { fieldName: string; expr: Expr };
export type StructFieldBinding = { fieldName: string; binding: Binding };

export type TraitField = {
  tag: "func";
  name: string;
  typeParameters: TypeParam[];
  parameters: TypeExpr[];
  returnType: TypeExpr;
};

export type Expr =
  | { tag: "identifier"; value: string }
  | {
      tag: "typeConstructor";
      value: string;
      fields: StructFieldValue[];
    }
  | { tag: "tuple"; fields: StructFieldValue[] }
  | { tag: "list"; items: Expr[] }
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
  | { tag: "identifier"; value: string; typeArgs: TypeExpr[] }
  | { tag: "tuple"; typeArgs: TypeExpr[] }
  | {
      tag: "func";
      typeParameters: TypeParam[];
      parameters: TypeExpr[];
      returnType: TypeExpr;
    };

export type TypeBinding = {
  tag: "identifier";
  value: string;
  typeParameters: TypeParam[];
};

export type TypeParam = {
  tag: "identifier";
  value: string;
  traits: TraitExpr[];
};

export type TraitExpr = {
  tag: "identifier";
  value: string;
  typeArgs: TypeExpr[];
};
