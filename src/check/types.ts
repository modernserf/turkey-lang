import { StrictMap } from "../strict-map";
import {
  Binding,
  Expr,
  EnumBinding,
  Stmt,
  StructFieldValue,
  TraitExpr,
  TypeExpr,
} from "../ast";
import { IRStmt, IRExpr, Builtin } from "../ir";

export type Type =
  | {
      tag: "concrete";
      name: symbol;
      parameters: Type[];
      // extra type-specific fields
      traitParams: TraitParam[];
      arraySize: number;
    }
  | { tag: "abstract"; name: symbol; traits: Trait[] };

export type Trait = { name: symbol; parameters: Type[] };
export type TraitParam = { type: Type; trait: Trait };

export function createVar(name: symbol, traits: Trait[]): Type {
  return { tag: "abstract", name, traits };
}
export function createType(name: symbol, parameters: Type[]): Type {
  return { tag: "concrete", name, parameters, traitParams: [], arraySize: 0 };
}

export function createTrait(name: symbol, parameters: Type[]): Trait {
  return { name, parameters };
}

export const tupleTypeName = Symbol("Tuple");
export function tupleType(parameters: Type[]): Type {
  return createType(tupleTypeName, parameters);
}

export const funcTypeName = Symbol("Func");
export function funcType(
  returnType: Type,
  parameters: Type[],
  traitParams: TraitParam[]
): Type {
  return {
    tag: "concrete",
    name: funcTypeName,
    parameters: [returnType, ...parameters],
    traitParams,
    arraySize: 0,
  };
}

export const arrayTypeName = Symbol("Array");
export function arrayType(type: Type, arraySize: number): Type {
  return {
    tag: "concrete",
    name: arrayTypeName,
    parameters: [type],
    traitParams: [],
    arraySize,
  };
}

export const vecTypeName = Symbol("Vec");
export function vecType(type: Type): Type {
  return createType(vecTypeName, [type]);
}

export const voidType = tupleType([]);
export const intType = createType(Symbol("Int"), []);
export const floatType = createType(Symbol("Float"), []);
export const stringType = createType(Symbol("String"), []);
export const boolType = createType(Symbol("Bool"), []);

export const showTrait = createTrait(Symbol("Show"), []);
export const numTrait = createTrait(Symbol("Num"), []);
export const eqTrait = createTrait(Symbol("Eq"), []);

export type CheckedExpr = IRExpr & { type: Type };

export type CheckedStmt =
  | Exclude<IRStmt, { tag: "expr" }>
  | {
      tag: "expr";
      expr: IRExpr;
      type: Type;
    };

export type UnifyResult = {
  type: Type;
  leftResults: Map<symbol, Type>;
  rightResults: Map<symbol, Type>;
};

export interface TreeWalker {
  expr(expr: Expr, context: Type | null): CheckedExpr;
  block(block: Stmt[]): { block: CheckedStmt[]; type: Type };
}

export type TypeConstructor =
  | { tag: "struct"; type: Type }
  | { tag: "enum"; type: Type; tagName: string; tagValue: number };

export interface Scope {
  break(): CheckedStmt;
  continue(): CheckedStmt;
  return(expr: CheckedExpr | null): CheckedStmt;
  initValue(
    binding: Binding,
    type: Type
  ): { root: symbol; rest: CheckedStmt[] };
  getValue(str: string): CheckedExpr;
  initType(name: string, value: Type): void;
  getType(typeExpr: TypeExpr, typeParams?: StrictMap<string, Type>): Type;
  initStructConstructor(name: string, type: Type): void;
  initEnumConstructors(names: string[], type: Type): void;
  getConstructor(name: string): TypeConstructor;
  blockScope<T>(fn: () => T): T;
  loopScope<T>(id: symbol, fn: () => T): T;
  funcScope<T>(
    checkReturns: (type: Type) => void,
    fn: () => T
  ): { upvalues: symbol[]; result: T };
}

export interface Func {
  create(
    binding: symbol,
    typeParams: Array<{ type: Type; traits: Trait[] }>,
    parameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    block: Stmt[]
  ): CheckedStmt;
  createClosure(
    inParams: Binding[],
    inBlock: Stmt[],
    typeHint: Type
  ): CheckedExpr;
  call(callee: Expr, args: Expr[]): CheckedExpr;
  op(op: Builtin, type: Type, args: Expr[]): CheckedExpr;
}

export interface Traits {
  getTrait(traitExpr: TraitExpr): Trait;
  provideImpl(type: Type, trait: Trait, impl: IRExpr): void;
  getImpl(type: Type, trait: Trait): IRExpr;
}

export interface Matcher {
  binding: symbol;
  case(
    scope: Scope,
    binding: EnumBinding
  ): { index: number; block: CheckedStmt[] };
  done(): void;
}

export interface Obj {
  list(ctor: TypeConstructor, items: Expr[], context: Type | null): CheckedExpr;
  sizedList(
    ctor: TypeConstructor,
    value: Expr,
    size: number,
    context: Type | null
  ): CheckedExpr;
  tuple(
    ctor: TypeConstructor,
    items: Expr[],
    context: Type | null
  ): CheckedExpr;
  record(
    ctor: TypeConstructor,
    fields: StructFieldValue[],
    context: Type | null
  ): CheckedExpr;
  getField(expr: CheckedExpr, value: string): CheckedExpr;
  getIndex(expr: CheckedExpr, value: number): CheckedExpr;
  getTupleItems(expr: CheckedExpr): CheckedExpr[];
  createMatcher(expr: CheckedExpr): Matcher;
  iter(expr: CheckedExpr): CheckedExpr;
  assign(target: Expr, index: number, expr: Expr): CheckedStmt;
}

type StdEnum =
  | {
      tag: "record";
      index: number;
      fields: Array<{ name: string; type: Type }>;
    }
  | { tag: "tuple"; index: number; fields: Type[] };
type StdStruct =
  | { tag: "record"; fields: Array<{ name: string; type: Type }> }
  | { tag: "tuple"; fields: Type[] };

type StdType =
  | { tag: "primitive"; type: Type }
  | { tag: "array"; type: Type }
  | { tag: "enum"; type: Type; constructors: Map<string, StdEnum> }
  | { tag: "struct"; type: Type; constructor: StdStruct };

export type Stdlib = {
  types: Map<string, StdType>;
  values: Map<string, CheckedExpr>;
  traits: Map<string, Trait>;
  impls: Map<Type["name"], Map<Trait["name"], IRExpr>>;
  unaryOps: Map<string, { op: Builtin; type: Type }>;
  binaryOps: Map<string, { op: Builtin; type: Type }>;
};
