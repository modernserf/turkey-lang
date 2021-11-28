import { Opcode, Stmt } from "../types";
import { BlockScope } from "./block-scope";
// import { Compiler } from "./compiler";
import { Func } from "./func";
import { Obj } from "./obj";
import { Op } from "./op";
import { Traits } from "./trait";
import { TreeWalker } from "./tree-walker";
import {
  boolType,
  BoundType,
  BuiltIn,
  CheckedStmt,
  createVar,
  EnumCaseInfo,
  eqTrait,
  floatType,
  funcType,
  intType,
  listType,
  numTrait,
  showTrait,
  stringType,
  Type,
  TypeConstructor,
  voidType,
} from "./types";

function createEnum(
  index: number,
  type: BoundType,
  inFields: Array<[string, Type]> = [],
  isTuple = false
) {
  const fields = new Map(
    inFields.map(([name, type], i) => [name, { type, index: i + 1 }])
  );

  return { tag: "enum", index, type, fields, isTuple } as const;
}

function builtIn(
  opcode: Opcode[],
  parameters: Type[],
  returnType: Type
): BuiltIn {
  return { tag: "builtIn", opcode, type: funcType(parameters, returnType) };
}

const showT = createVar(Symbol("T"), [showTrait]);
const vars: Array<[string, BoundType]> = [
  ["print", funcType([showT], voidType)],
];
const types: Array<[string, BoundType]> = [
  ["Int", intType],
  ["Float", floatType],
  ["String", stringType],
  ["Bool", boolType],
  ["Void", voidType],
  ["List", listType],
];

const falseVal = createEnum(0, boolType);
const trueVal = createEnum(1, boolType);

const nilVal = createEnum(0, listType);
const consVal = createEnum(
  1,
  listType,
  [
    ["0", listType.parameters[0]],
    ["1", listType],
  ],
  true
);

const typeConstructors: Array<[string, TypeConstructor]> = [
  ["False", falseVal],
  ["True", trueVal],
  ["Nil", nilVal],
  ["Cons", consVal],
];

// prettier-ignore
const enumInfo: Array<[BoundType, Array<[string, EnumCaseInfo]>]> = [
  [boolType, [
    ["False", falseVal],
    ["True", trueVal],
  ]],
  [listType, [
    ["Nil", nilVal],
    ["Cons", consVal]
  ]]
]

const numT = createVar(Symbol("T"), [numTrait]);
const eqT = createVar(Symbol("T"), [eqTrait]);
const unaryOps: Map<string, BuiltIn> = new Map([
  ["!", builtIn([Opcode.Not], [boolType], boolType)],
  ["-", builtIn([Opcode.Neg], [numT], numT)],
]);
const binaryOps: Map<string, BuiltIn> = new Map([
  ["+", builtIn([Opcode.Add], [numT, numT], numT)],
  ["-", builtIn([Opcode.Sub], [numT, numT], numT)],
  ["*", builtIn([Opcode.Mul], [numT, numT], numT)],
  ["%", builtIn([Opcode.Mod], [numT, numT], numT)],
  ["/", builtIn([Opcode.Div], [numT, numT], floatType)],
  ["<", builtIn([Opcode.Lt], [numT, numT], boolType)],
  ["<=", builtIn([Opcode.Lte], [numT, numT], boolType)],
  [">", builtIn([Opcode.Gt], [numT, numT], boolType)],
  [">=", builtIn([Opcode.Gte], [numT, numT], boolType)],
  ["==", builtIn([Opcode.Eq], [eqT, eqT], boolType)],
  ["!=", builtIn([Opcode.Neq], [eqT, eqT], boolType)],
]);

const blockScope = new BlockScope(vars, types);
// const compiler = new Compiler();
const func = new Func();
const obj = new Obj(typeConstructors, enumInfo);
const op = new Op(unaryOps, binaryOps);
const traits = new Traits();
const treeWalker = new TreeWalker();

blockScope.func = func;
blockScope.obj = obj;
func.treeWalker = treeWalker;
func.scope = blockScope;
obj.treeWalker = treeWalker;
obj.scope = blockScope;
treeWalker.scope = blockScope;
// treeWalker.compiler = compiler;
treeWalker.func = func;
treeWalker.obj = obj;
treeWalker.op = op;
treeWalker.traits = traits;

export function check(program: Stmt[]): CheckedStmt[] {
  return treeWalker.block(program).block;
}
