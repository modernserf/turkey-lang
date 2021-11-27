import { Stmt } from "../types";
import { BlockScope } from "./block-scope";
import { Func } from "./func";
import { Obj } from "./obj";
import { Op } from "./op";
import { Traits } from "./trait";
import { TreeWalker } from "./tree-walker";
import { CheckedStmt } from "./types";

const blockScope = new BlockScope();
const func = new Func();
const obj = new Obj();
const op = new Op();
const traits = new Traits();
const treeWalker = new TreeWalker();

blockScope.func = func;
blockScope.obj = obj;
func.traits = traits;
func.treeWalker = treeWalker;
func.scope = blockScope;
obj.treeWalker = treeWalker;
obj.scope = blockScope;
treeWalker.scope = blockScope;
treeWalker.func = func;
treeWalker.obj = obj;
treeWalker.op = op;

export function check(program: Stmt[]): CheckedStmt[] {
  return treeWalker.block(program).block;
}
