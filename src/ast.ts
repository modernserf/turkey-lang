export type Stmt =
  | { tag: "type"; binding: TypeBinding; type: TypeExpr }
  | { tag: "enum"; binding: TypeBinding; cases: EnumType[] }
  | {
      tag: "struct";
      binding: TypeBinding;
      fields: StructFieldType[];
    }
  | {
      tag: "structTuple";
      binding: TypeBinding;
      fields: TypeExpr[];
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
  | { tag: "assign"; target: Expr; index: number; value: Expr }
  | { tag: "expr"; expr: Expr };

export type EnumType =
  | {
      tag: "record";
      tagName: string;
      fields: StructFieldType[];
    }
  | {
      tag: "tuple";
      tagName: string;
      fields: TypeExpr[];
    };
export type EnumBinding =
  | {
      tag: "record";
      tagName: string;
      fields: StructFieldBinding[];
    }
  | {
      tag: "tuple";
      tagName: string;
      fields: Binding[];
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
  | { tag: "typeLiteral"; value: string }
  | { tag: "typeTuple"; value: string; items: Expr[] }
  | { tag: "tuple"; items: Expr[] }
  | { tag: "typeSizedList"; value: string; expr: Expr; size: number }
  | { tag: "typeList"; value: string; items: Expr[] }
  | { tag: "list"; items: Expr[] }
  | {
      tag: "typeRecord";
      value: string;
      fields: StructFieldValue[];
    }
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
  | { tag: "index"; expr: Expr; index: number }
  | { tag: "call"; expr: Expr; args: Expr[] };

export type IfCase = { tag: "cond"; predicate: Expr; block: Stmt[] };

export type MatchCase = { binding: EnumBinding; block: Stmt[] };

export type Binding =
  | { tag: "identifier"; value: string }
  | { tag: "record"; fields: StructFieldBinding[] }
  | { tag: "tuple"; fields: Binding[] };

export type TypeExpr =
  | { tag: "identifier"; value: string; typeArgs: TypeExpr[] }
  | { tag: "array"; value: string; type: TypeExpr; size: number }
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
