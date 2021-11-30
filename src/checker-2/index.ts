import { Opcode, Stmt } from "../types";
import { Compiler } from "./compiler";
import { TreeWalker } from "./tree-walker";
import {
  createVar,
  showTrait,
  StdLib,
  funcType,
  voidType,
  intType,
  stringType,
} from "./types";

const showT = createVar(Symbol("T"), [showTrait]);

const stdlib: StdLib = {
  values: [
    {
      name: "print",
      attrs: {
        type: funcType([showT], voidType),
        funcInfo: {
          traitParameters: [{ type: showT, trait: showTrait }],
          parameters: [{ name: "arg", type: showT }],
          returns: { type: voidType },
          block: [],
        },
        trait: { todo: true },
      },
    },
  ],
  impls: [
    {
      trait: showTrait,
      impls: [
        {
          type: intType,
          attrs: {
            type: funcType([intType], voidType),
            funcInfo: {
              traitParameters: [],
              parameters: [{ name: "arg", type: intType }],
              returns: { type: voidType },
              block: [],
            },
            builtIn: {
              code: [Opcode.PrintNum],
            },
          },
        },
        {
          type: stringType,
          attrs: {
            type: funcType([stringType], voidType),
            funcInfo: {
              traitParameters: [],
              parameters: [{ name: "arg", type: stringType }],
              returns: { type: voidType },
              block: [],
            },
            builtIn: {
              code: [Opcode.PrintStr],
            },
          },
        },
      ],
    },
  ],
};

export function compile(program: Stmt[]) {
  const treeWalker = new TreeWalker(stdlib);
  return new Compiler(stdlib).program(treeWalker.program(program));
}
