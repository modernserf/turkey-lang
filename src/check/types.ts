import { Binding, Expr, Stmt, TraitExpr, TypeExpr } from "../ast";
import { IRStmt, IRExpr, Builtin } from "../ir";
import { CheckerCtx } from "./checker";

export type Type =
  | {
      tag: "concrete";
      name: symbol;
      parameters: Type[];
      traitParams: TraitParam[];
    }
  | { tag: "abstract"; name: symbol; traits: Trait[] };

export type Trait = { name: symbol; parameters: Type[] };
export type TraitParam = { type: Type; trait: Trait };

export function createVar(name: symbol, traits: Trait[]): Type {
  return { tag: "abstract", name, traits };
}
export function createType(
  name: symbol,
  parameters: Type[],
  traitParams: TraitParam[]
): Type {
  return { tag: "concrete", name, parameters, traitParams };
}

export function createTrait(name: symbol, parameters: Type[]): Trait {
  return { name, parameters };
}

export const tupleTypeName = Symbol("Tuple");
export function tupleType(parameters: Type[]): Type {
  return createType(tupleTypeName, parameters, []);
}

export const funcTypeName = Symbol("Func");
export function funcType(
  returnType: Type,
  parameters: Type[],
  traitParams: TraitParam[]
): Type {
  return createType(funcTypeName, [returnType, ...parameters], traitParams);
}

export const voidType = tupleType([]);
export const intType = createType(Symbol("Int"), [], []);
export const floatType = createType(Symbol("Float"), [], []);
export const stringType = createType(Symbol("String"), [], []);
export const boolType = createType(Symbol("Bool"), [], []);

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
  typeExpr(typeExpr: TypeExpr, typeParams?: Map<string, Type>): Type;
}

export interface Scope {
  break(): CheckedStmt;
  continue(): CheckedStmt;
  return(expr: CheckedExpr | null): CheckedStmt;
  initValue(
    binding: Binding,
    type: Type
  ): { root: symbol; rest: Array<{ name: symbol; expr: CheckedExpr }> };
  getValue(str: string): CheckedExpr;
  initType(name: string, value: Type): void;
  getType(name: string): { type: Type };
  blockScope<T>(fn: () => T): T;
  loopScope<T>(id: symbol, fn: () => T): T;
  funcScope<T>(
    checkReturns: (type: Type) => void,
    fn: () => T
  ): { upvalues: symbol[]; result: T };
}

export interface Func {
  create(
    name: string,
    typeParams: Array<{ type: Type; traits: Trait[] }>,
    parameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    block: Stmt[]
  ): IRExpr;
  call(callee: Expr, args: Expr[]): CheckedExpr;
  op(op: Builtin, type: Type, args: Expr[]): CheckedExpr;
}

export interface Traits {
  getTrait(traitExpr: TraitExpr): Trait;
  provideImpl(type: Type, trait: Trait, impl: IRExpr): void;
  getImpl(type: Type, trait: Trait): IRExpr;
}

export type Stdlib = {
  types: Map<string, { type: Type }>;
  values: Map<string, CheckedExpr>;
  traits: Map<string, Trait>;
  impls: Map<Type["name"], Map<Trait["name"], IRExpr>>;
  unaryOps: Map<string, { op: Builtin; type: Type }>;
  binaryOps: Map<string, { op: Builtin; type: Type }>;
};
