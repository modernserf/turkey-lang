import { Stmt } from "../ast";
import { TreeWalker } from "./tree-walker";
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
  boolType,
  arrayType,
  vecType,
} from "./types";
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
  return expr_([
    //
    func_([], [value], [builtIn_("print_string", [value])]),
  ]);
})();

// Num has an empty implementation, you just have to have it
// TODO: how do you prevent other types from trying to implement Num?
const implNum = expr_([]);

const implEqPrimitive: IRExpr = (() => {
  const value = Symbol("value");
  return expr_([
    // this is just the identity function
    func_([], [value], [value]),
  ]);
})();

const anyT = createVar(Symbol("T"), []);
const numT = createVar(Symbol("T"), [numTrait]);
const eqT = createVar(Symbol("T"), [eqTrait]);

const stdlib: Stdlib = {
  types: new Map([
    ["Void", { tag: "primitive", type: voidType }],
    ["Int", { tag: "primitive", type: intType }],
    ["Float", { tag: "primitive", type: floatType }],
    ["String", { tag: "primitive", type: stringType }],
    [
      "Bool",
      {
        tag: "enum",
        type: boolType,
        constructors: new Map([
          ["False", { tag: "tuple", index: 0, fields: [] }],
          ["True", { tag: "tuple", index: 1, fields: [] }],
        ]),
      },
    ],
    ["Array", { tag: "array", type: arrayType(anyT, 0) }],
    ["Vec", { tag: "array", type: vecType(anyT) }],
  ]),
  values: new Map([["print", printFunc]]),
  traits: new Map([
    ["Show", showTrait],
    ["Num", numTrait],
    ["Eq", eqTrait],
  ]),
  impls: new Map([
    [
      intType.name,
      new Map([
        [showTrait.name, implNumShow],
        [numTrait.name, implNum],
        [eqTrait.name, implEqPrimitive],
      ]),
    ],
    [
      floatType.name,
      new Map([
        [showTrait.name, implNumShow],
        [numTrait.name, implNum],
        [eqTrait.name, implEqPrimitive],
      ]),
    ],
    [
      stringType.name,
      new Map([
        [showTrait.name, implStringShow],
        [eqTrait.name, implEqPrimitive],
      ]),
    ],
  ]),
  unaryOps: new Map([
    ["!", { op: "not", type: funcType(boolType, [boolType], []) }],
    ["-", { op: "neg", type: funcType(numT, [numT], []) }],
  ]),
  binaryOps: new Map([
    // arithmetic ops
    ["+", { op: "add", type: funcType(numT, [numT, numT], []) }],
    ["-", { op: "sub", type: funcType(numT, [numT, numT], []) }],
    ["*", { op: "mul", type: funcType(numT, [numT, numT], []) }],
    ["%", { op: "mod", type: funcType(numT, [numT, numT], []) }],
    ["/", { op: "div", type: funcType(floatType, [numT, numT], []) }],
    // comparison ops
    ["<", { op: "lt", type: funcType(boolType, [numT, numT], []) }],
    ["<=", { op: "lte", type: funcType(boolType, [numT, numT], []) }],
    [">", { op: "gt", type: funcType(boolType, [numT, numT], []) }],
    [">=", { op: "gte", type: funcType(boolType, [numT, numT], []) }],
    // equality
    ["==", { op: "eq", type: funcType(boolType, [eqT, eqT], []) }],
    ["!=", { op: "neq", type: funcType(boolType, [eqT, eqT], []) }],
    // logical
    ["&&", { op: "and", type: funcType(boolType, [boolType, boolType], []) }],
    ["||", { op: "or", type: funcType(boolType, [boolType, boolType], []) }],
    ["^^", { op: "or", type: funcType(boolType, [boolType, boolType], []) }],
  ]),
};

export function check(program: Stmt[]): IRStmt[] {
  const treeWalker = new TreeWalker(stdlib);
  return treeWalker.program(program);
}
