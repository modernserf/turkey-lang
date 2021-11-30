import { Opcode } from "../types";
export type Impl = { tag: "impl"; attrs: ExprAttrs };

// TODO: trait params
export type Trait = { tag: "trait"; name: symbol };

export type TypeVar = { tag: "var"; name: symbol; traits: Trait[] };
export type BoundType = {
  tag: "type";
  name: symbol;
  parameters: Type[];
  traits: Trait[];
};
export type Type = TypeVar | BoundType;
export type TypeVarMap = Map<string, TypeVar>;

export function createTrait(name: symbol): Trait {
  return { tag: "trait", name };
}

export function createVar(name: symbol, traits: Trait[]): TypeVar {
  return { tag: "var", name, traits };
}

export function createType(
  name: symbol,
  parameters: Type[],
  traits: Trait[]
): BoundType {
  return { tag: "type", name, parameters, traits };
}

export const numTrait = createTrait(Symbol("Num"));
export const showTrait = createTrait(Symbol("Show"));
export const eqTrait = createTrait(Symbol("Eq"));

export const intType = createType(
  Symbol("Int"),
  [],
  [numTrait, showTrait, eqTrait]
);
export const floatType = createType(
  Symbol("Float"),
  [],
  [numTrait, showTrait, eqTrait]
);
export const stringType = createType(
  Symbol("String"),
  [],
  [showTrait, eqTrait]
);
export const boolType = createType(Symbol("Bool"), [], [eqTrait]);

export const tupleTypeName = Symbol("Tuple");
export function tupleType(fields: Type[]): BoundType {
  return createType(tupleTypeName, fields, []);
}
export const voidType = createType(tupleTypeName, [], []);
export const funcTypeName = Symbol("Func");
export function funcType(parameters: Type[], returnType: Type): BoundType {
  return createType(funcTypeName, [returnType, ...parameters], []);
}

export const listType = createType(
  Symbol("List"),
  [createVar(Symbol("T"), [])],
  []
);

export type Ident = string;

export type BaseTypedExpr =
  | { tag: "primitive"; value: number }
  | { tag: "string"; value: string }
  | { tag: "root"; value: Ident }
  | { tag: "upvalue"; value: Ident }
  | { tag: "local"; value: Ident }
  | { tag: "call"; callee: TypedExpr; args: BaseTypedExpr[]; traitArgs: Impl[] }
  | { tag: "builtin"; code: Opcode[]; args: BaseTypedExpr[]; traitArgs: Impl[] }
  | { tag: "func"; parameters: Ident[]; block: TypedStmt[] }
  | { tag: "do"; block: TypedStmt[] }
  | {
      tag: "if";
      cases: Array<{ predicate: BaseTypedExpr; block: TypedStmt[] }>;
      elseBlock: TypedStmt;
    };

// export type CheckedExpr =
// | { tag: "builtIn"; opcode: Opcode[] }
// | { tag: "primitive"; value: number }
// | { tag: "string"; value: string }
// | { tag: "object"; fields: CheckedExpr[] }
// | { tag: "identifier"; value: string }
// | {
//     tag: "func";
//     name: string | null;
//     upvalues: string[];
//     parameters: CheckedBinding[];
//     block: CheckedStmt[];
//   }
// | { tag: "field"; expr: CheckedExpr; index: number }
// | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[] }
// | { tag: "do"; block: CheckedStmt[] }
// | {
//     tag: "if";
//     cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
//     elseBlock: CheckedStmt[];
//   }
// | {
//     tag: "match";
//     expr: CheckedExpr;
//     cases: CheckedMatchCase[];
//   };

export type ExprAttrs = {
  type: BoundType;
  // can be on func or any expr that produces func
  funcInfo?: {
    traitParameters: Array<{ trait: Trait; type: TypeVar }>;
    // returns: ExprAttrs;
  };
  builtIn?: {
    code: Opcode[];
  };
  trait?: {
    todo: boolean;
  };
};

export type TypedExpr = BaseTypedExpr & ExprAttrs;

export type TypedStmt =
  | { tag: "let"; name: string; expr: TypedExpr }
  | { tag: "expr"; expr: TypedExpr; type: BoundType };

export type TypedBlock = { block: TypedStmt[]; result: ExprAttrs };

export type StdLib = {
  values: Array<{ name: string; attrs: ExprAttrs }>;
  impls: Array<{
    trait: Trait;
    impls: Array<{ type: BoundType; attrs: ExprAttrs }>;
  }>;
};
