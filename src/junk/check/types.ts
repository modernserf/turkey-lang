import { Scope } from "../../scope";
import {
  Binding,
  EnumCase,
  Expr,
  MatchBinding,
  Stmt,
  StructFieldType,
  StructFieldValue,
  TypeExpr,
  Opcode,
  CheckedExpr,
  CheckedStmt,
  CheckedBinding,
  CheckedStructFieldBinding,
  CheckedMatchCase,
} from "../../types";

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

type CheckedNonExpr = Exclude<CheckedStmt, { tag: "expr" }>;

export type TypedStmt =
  | CheckedNonExpr
  | { tag: "expr"; expr: CheckedExpr; hasValue: boolean; type: BoundType };

export type TypedExpr = CheckedExpr & { type: BoundType };

export type BuiltIn = { tag: "builtIn"; opcode: Opcode[]; type: BoundType };

export type CheckedUpvalue = { name: string; type: BoundType };

export type VarScope = Scope<string, BoundType>;
export type TypeParamScope = Scope<string, TypeVar>;

export type CheckedBlock = { block: TypedStmt[]; type: BoundType };

export type FieldMap = Map<string, { type: Type; index: number }>;
export type TypeConstructor =
  | { tag: "struct"; type: BoundType; fields: FieldMap }
  | {
      tag: "enum";
      index: number;
      type: BoundType;
      fields: FieldMap;
    };
export type StructInfo = {
  type: BoundType;
  fields: FieldMap;
  isTuple: boolean;
};
export type EnumInfo = { type: BoundType; cases: Map<string, EnumCaseInfo> };
export type EnumCaseInfo = {
  index: number;
  fields: FieldMap;
  isTuple: boolean;
};

export interface TreeWalker {
  block(block: Stmt[]): CheckedBlock;
  expr(expr: Expr, typeHint: BoundType | null): TypedExpr;
  typeExpr(typeExpr: TypeExpr, vars?: TypeParamScope): Type;
}

export interface BlockScope {
  inScope<T>(fn: (outerScope: VarScope) => T): T;
  getVar(name: string): BoundType;
  getType(name: string): BoundType;
  initVar(binding: Binding, expr: BoundType): CheckedBinding;
  initTypeAlias(name: string, type: Type): void;
}

export interface Op {
  unary(operator: string): TypedExpr;
  binary(operator: string): TypedExpr;
}

export interface Checker {
  unify(left: Type, right: Type): void;
  mustResolve(type: Type): BoundType;
  resolve(type: Type): Type;
}

export interface Func {
  createFunc(
    name: string,
    typeVars: TypeParamScope,
    parameters: Array<{ binding: Binding; type: TypeExpr }>,
    returnType: TypeExpr,
    block: Stmt[]
  ): TypedStmt;
  createClosure(
    parameters: Binding[],
    block: Stmt[],
    typeHint: BoundType | null
  ): TypedExpr;
  call(callee: TypedExpr, args: Expr[]): TypedExpr;
  return(expr: Expr | null): TypedExpr | null;
  checkUpvalue(
    name: string,
    type: BoundType,
    isUpvalue: (scope: VarScope) => boolean
  ): void;
}

export interface Obj {
  inScope<T>(fn: () => T): T;
  createTuple(
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): TypedExpr;
  createList(values: Expr[], typeHint: BoundType | null): TypedExpr;
  createTagged(
    tag: string,
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): TypedExpr;
  getField(
    target: BoundType,
    fieldName: string
  ): { type: BoundType; index: number };
  checkTupleFields(targetType: BoundType, size: number): void;
  checkMatchTarget(type: BoundType): Match;
  getIterator(target: Expr): { target: TypedExpr; iter: BoundType };
  declareStruct(
    name: string,
    typeVars: TypeParamScope,
    fields: StructFieldType[],
    isTuple: boolean
  ): void;
  declareEnum(name: string, typeVars: TypeParamScope, cases: EnumCase[]): void;
}

export interface Match {
  matchBinding(binding: MatchBinding): CheckedStructFieldBinding[];
  sortCases(cases: CheckedMatchCase[]): CheckedMatchCase[];
}

export interface Traits {
  getTraitConstraint(expr: TypeExpr): Trait;
  boxValue(expr: TypedExpr, traits: Trait[]): TypedExpr;
}
