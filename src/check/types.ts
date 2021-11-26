import { Scope } from "../scope";
import {
  Binding,
  EnumCase,
  Expr,
  MatchBinding,
  Stmt,
  StructFieldType,
  StructFieldValue,
  TypeExpr,
  TypeParam,
  Opcode,
} from "../types";

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

export function createVar(name: symbol, traits: Trait[] = []): TypeVar {
  return { tag: "var", name, traits };
}

export function createType(
  name: symbol,
  parameters: Type[],
  traits: Trait[] = []
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
export const voidType = createType(tupleTypeName, [], []);
export const funcTypeName = Symbol("Func");
export function funcType(parameters: Type[], returnType: Type): BoundType {
  return createType(funcTypeName, [returnType, ...parameters]);
}

export type CheckedExpr =
  | { tag: "primitive"; value: number; type: BoundType }
  | { tag: "string"; value: string; type: BoundType }
  | { tag: "object"; fields: CheckedExpr[]; type: BoundType }
  | { tag: "identifier"; value: string; type: BoundType }
  | {
      tag: "closure";
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: BoundType;
    }
  | { tag: "field"; expr: CheckedExpr; index: number; type: BoundType }
  | { tag: "builtIn"; opcode: Opcode[]; type: BoundType }
  | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[]; type: BoundType }
  | { tag: "do"; block: CheckedStmt[]; type: BoundType }
  | {
      tag: "if";
      cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
      elseBlock: CheckedStmt[];
      type: BoundType;
    }
  | {
      tag: "match";
      expr: CheckedExpr;
      cases: CheckedMatchCase[];
      type: BoundType;
    };

export type CheckedMatchCase = {
  bindings: CheckedStructFieldBinding[];
  block: CheckedStmt[];
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
      type: BoundType;
    }
  | { tag: "while"; expr: CheckedExpr; block: CheckedStmt[] }
  | {
      tag: "for";
      binding: CheckedBinding;
      expr: CheckedExpr;
      block: CheckedStmt[];
    }
  | { tag: "expr"; expr: CheckedExpr; hasValue: boolean };

export type CheckedBinding =
  | { tag: "identifier"; value: string }
  | { tag: "struct"; fields: CheckedStructFieldBinding[] };

export type CheckedStructFieldBinding = {
  fieldIndex: number;
  binding: CheckedBinding;
};

export type BuiltIn = { tag: "builtIn"; opcode: Opcode[]; type: BoundType };
export function builtIn(
  opcode: Opcode[],
  parameters: Type[],
  returnType: Type
): BuiltIn {
  return { tag: "builtIn", opcode, type: funcType(parameters, returnType) };
}

export type CheckedParam = { binding: CheckedBinding; type: BoundType };
export type CheckedUpvalue = { name: string; type: BoundType };

export type VarScope = Scope<string, BoundType>;

export type CheckedBlock = { block: CheckedStmt[]; type: BoundType };

export interface TreeWalker {
  block(block: Stmt[]): CheckedBlock;
  expr(expr: Expr, typeHint: BoundType | null): CheckedExpr;
  typeExpr(typeExpr: TypeExpr, vars?: Scope<string, TypeVar>): Type;
}

export interface BlockScope {
  inScope<T>(fn: (outerScope: VarScope) => T): T;
  getVar(name: string): BoundType;
  getType(name: string): BoundType;
  initVar(binding: Binding, expr: BoundType): CheckedBinding;
  initTypeAlias(name: string, type: Type): void;
}

export interface Op {
  unary(operator: string): CheckedExpr;
  binary(operator: string): CheckedExpr;
}

export interface Checker {
  unify(left: Type, right: Type): void;
  mustResolve(type: Type): BoundType;
  resolve(type: Type): Type;
}

export interface Func {
  createFunc(
    name: string,
    typeParameters: TypeParam[],
    parameters: Array<{ binding: Binding; type: TypeExpr }>,
    returnType: TypeExpr,
    block: Stmt[]
  ): CheckedStmt;
  createClosure(
    parameters: Binding[],
    block: Stmt[],
    typeHint: BoundType | null
  ): CheckedExpr;
  call(callee: CheckedExpr, args: Expr[]): CheckedExpr;
  return(expr: Expr | null): CheckedExpr | null;
  checkUpvalue(
    name: string,
    type: BoundType,
    isUpvalue: (scope: VarScope) => boolean
  ): void;
}

export interface Obj {
  tupleType(type: Type[]): BoundType;
  createTuple(
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): CheckedExpr;
  createList(values: Expr[], typeHint: BoundType | null): CheckedExpr;
  createTagged(
    tag: string,
    fields: StructFieldValue[],
    typeHint: BoundType | null
  ): CheckedExpr;
  getField(
    target: BoundType,
    fieldName: string
  ): { type: BoundType; index: number };
  checkTupleFields(
    targetType: BoundType,
    fields: CheckedStructFieldBinding[]
  ): void;
  checkMatchTarget(type: BoundType): Match;
  getIterator(target: Expr): { target: CheckedExpr; iter: BoundType };
  declareStruct(
    binding: Binding,
    fields: StructFieldType[],
    isTuple: boolean
  ): void;
  declareEnum(binding: Binding, cases: EnumCase[]): void;
}

export interface Match {
  matchBinding(binding: MatchBinding): CheckedStructFieldBinding[];
  sortCases(cases: CheckedMatchCase[]): CheckedMatchCase[];
}
