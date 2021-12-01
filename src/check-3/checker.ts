import { Checker as IChecker, Type } from "./types";

export class TypeCheckError extends Error {
  constructor(public expected: Type, public received: Type) {
    super("TypeCheckError");
  }
}

export class Checker implements IChecker {
  checkType(expected: Type, received: Type): void {
    if (expected.tag === "abstract" || received.tag === "abstract") {
      throw new Error("todo");
    }
    if (expected.parameters.length !== received.parameters.length) {
      throw new TypeCheckError(expected, received);
    }
    if (expected.name !== received.name) {
      throw new TypeCheckError(expected, received);
    }
    expected.parameters.forEach((param, i) => {
      this.checkType(param, received.parameters[i]);
    });
  }
}
