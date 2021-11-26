import { Opcode } from "../types";
import {
  Op as IOp,
  boolType,
  createVar,
  numTrait,
  floatType,
  eqTrait,
  builtIn,
  BuiltIn,
} from "./types";

class OpError extends Error {
  constructor(op: string) {
    super(`Unknown operator: "${op}"`);
  }
}

const numT = createVar(Symbol("T"), [numTrait]);
const eqT = createVar(Symbol("T"), [eqTrait]);

export class Op implements IOp {
  private unaryOps: Map<string, BuiltIn> = new Map([
    ["!", builtIn([Opcode.Not], [boolType], boolType)],
    ["-", builtIn([Opcode.Neg], [numT], numT)],
  ]);
  private binaryOps: Map<string, BuiltIn> = new Map([
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
  unary(operator: string): BuiltIn {
    const res = this.unaryOps.get(operator);
    if (res) return res;
    throw new OpError(operator);
  }
  binary(operator: string): BuiltIn {
    const res = this.binaryOps.get(operator);
    if (res) return res;
    throw new OpError(operator);
  }
}
