import { Op as IOp, BuiltIn } from "./types";

// unknown operators should be caught at the parsing level
// istanbul ignore next
class OpError extends Error {
  constructor(op: string) {
    super(`Unknown operator: "${op}"`);
  }
}

export class Op implements IOp {
  constructor(
    private unaryOps: Map<string, BuiltIn>,
    private binaryOps: Map<string, BuiltIn>
  ) {}
  unary(operator: string): BuiltIn {
    const res = this.unaryOps.get(operator);
    if (res) return res;
    // istanbul ignore next
    throw new OpError(operator);
  }
  binary(operator: string): BuiltIn {
    const res = this.binaryOps.get(operator);
    if (res) return res;
    // istanbul ignore next
    throw new OpError(operator);
  }
}
