import { Stmt } from "../ast";
import { BlockScope } from "./block-scope";
import { TreeWalker } from "./tree-walker";
import { Func } from "./func";
import {
  intType,
  Stdlib,
  stringType,
  floatType,
  voidType,
  CheckedExpr,
  createVar,
  showTrait,
  funcType,
  numTrait,
  eqTrait,
} from "./types";
import { Traits } from "./trait";
import { IRExpr, IRStmt, func_, field_, call_, expr_, builtIn_ } from "../ir";

const printFunc: CheckedExpr = (() => {
  const implShow = Symbol("impl_Show_T");
  const value = Symbol("value");
  const expr = func_(
    [],
    [implShow, value],
    [call_(field_(implShow, 0), [value], false)]
  );

  const showT = createVar(Symbol("T"), [showTrait]);
  const type = funcType(voidType, [showT], [{ type: showT, trait: showTrait }]);

  return { ...expr, type };
})();

const implNumShow: IRExpr = (() => {
  const value = Symbol("value");
  return expr_([func_([], [value], [builtIn_("print_num", [value])])]);
})();

const implStringShow: IRExpr = (() => {
  const value = Symbol("value");
  return expr_([func_([], [value], [builtIn_("print_string", [value])])]);
})();

const stdlib: Stdlib = {
  types: new Map([
    ["Void", { type: voidType }],
    ["Int", { type: intType }],
    ["Float", { type: floatType }],
    ["String", { type: stringType }],
  ]),
  values: new Map([["print", printFunc]]),
  traits: new Map([
    ["Show", showTrait],
    ["Num", numTrait],
    ["Eq", eqTrait],
  ]),
  impls: new Map([
    [intType.name, new Map([[showTrait.name, implNumShow]])],
    [floatType.name, new Map([[showTrait.name, implNumShow]])],
    [stringType.name, new Map([[showTrait.name, implStringShow]])],
  ]),
};

export function check(program: Stmt[]): IRStmt[] {
  const treeWalker = new TreeWalker();
  const blockScope = new BlockScope(stdlib);
  const func = new Func();
  const traits = new Traits(stdlib);
  treeWalker.scope = blockScope;
  treeWalker.func = func;
  treeWalker.traits = traits;
  func.scope = blockScope;
  func.treeWalker = treeWalker;
  func.traits = traits;

  return treeWalker.program(stdlib, program);
}
