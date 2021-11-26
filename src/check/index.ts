import { Stmt } from "../types";
import { BlockScope } from "./block-scope";
import { Func } from "./func";
import { Op } from "./op";
import { TreeWalker } from "./tree-walker";
import { CheckedStmt } from "./types";

const blockScope = new BlockScope();
const func = new Func();
const op = new Op();
const treeWalker = new TreeWalker();

blockScope.func = func;
func.treeWalker = treeWalker;
func.scope = blockScope;
treeWalker.scope = blockScope;
treeWalker.func = func;
treeWalker.op = op;

export function check(program: Stmt[]): CheckedStmt[] {
  return treeWalker.block(program).block;
}
