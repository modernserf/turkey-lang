import { IRStmt } from "../compiler-2/types";
import { Stmt } from "../types";
import { BlockScope } from "./block-scope";
import { TreeWalker } from "./tree-walker";
import { Checker } from "./checker";
import { intType, Stdlib, stringType, floatType, voidType } from "./types";

const stdlib: Stdlib = {
  types: new Map([
    ["Void", { type: voidType }],
    ["Int", { type: intType }],
    ["Float", { type: floatType }],
    ["String", { type: stringType }],
  ]),
};

export function check(program: Stmt[]): IRStmt[] {
  const treeWalker = new TreeWalker();
  const blockScope = new BlockScope(stdlib);
  const checker = new Checker();
  treeWalker.scope = blockScope;
  treeWalker.checker = checker;

  return treeWalker.program(program);
}
