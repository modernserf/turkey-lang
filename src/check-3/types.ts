import { Binding, Expr, Stmt, TraitExpr, TypeExpr } from "../types";
import { IRStmt, IRExpr } from "../compiler-2/types";

export type Type =
  | { tag: "concrete"; name: symbol; parameters: Type[] }
  | { tag: "abstract"; name: symbol };

export type Trait = { name: symbol; parameters: Type[] };

export function createVar(name: symbol): Type {
  return { tag: "abstract", name };
}
export function createType(name: symbol, parameters: Type[]): Type {
  return { tag: "concrete", name, parameters };
}

export const tupleTypeName = Symbol("Tuple");
export function tupleType(parameters: Type[]): Type {
  return createType(tupleTypeName, parameters);
}

export const funcTypeName = Symbol("Func");
export function funcType(returnType: Type, parameters: Type[]): Type {
  return createType(funcTypeName, [returnType, ...parameters]);
}

export const voidType = tupleType([]);
export const intType = createType(Symbol("Int"), []);
export const floatType = createType(Symbol("Float"), []);
export const stringType = createType(Symbol("String"), []);
export const boolType = createType(Symbol("Bool"), []);

// abstract param name -> trait[]
export type TraitParams = Map<symbol, Trait[]>;

export type ExprAttrs = {
  type: Type;
  traitParams?: TraitParams;
};

export type CheckedExpr = IRExpr & { attrs: ExprAttrs };

export type CheckedStmt =
  | Exclude<IRStmt, { tag: "expr" }>
  | {
      tag: "expr";
      expr: IRExpr;
      attrs: ExprAttrs;
    };

export interface TreeWalker {
  expr(expr: Expr, context: ExprAttrs | null): CheckedExpr;
  block(block: Stmt[]): { block: CheckedStmt[]; attrs: ExprAttrs };
  typeExpr(typeExpr: TypeExpr, typeParams?: Map<string, ExprAttrs>): ExprAttrs;
}

export interface BlockScope {
  initValue(
    binding: Binding,
    value: ExprAttrs
  ): { root: symbol; rest: Array<{ name: symbol; expr: CheckedExpr }> };
  getValue(name: string): { name: symbol; attrs: ExprAttrs };
  initType(name: string, value: ExprAttrs): void;
  getType(name: string): { attrs: ExprAttrs };
  inScope<T>(fn: () => T): T;
}

export interface Checker {
  checkType(expected: Type, received: Type): void;
}

export interface Func {
  return(expr: Expr | null): CheckedExpr | null;
  create(
    traitParams: TraitParams,
    parameters: Array<{ binding: Binding; attrs: ExprAttrs }>,
    returns: ExprAttrs,
    block: Stmt[]
  ): CheckedExpr;
}

export interface Traits {
  getTrait(traitExpr: TraitExpr): Trait;
}

export type Stdlib = {
  types: Map<string, ExprAttrs>;
  // values: Map<string, { attrs: ExprAttrs,  }>;
};
