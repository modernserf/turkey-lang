import { Type, CheckedStmt, CheckedParam } from "./types";
import { Scope } from "./scope";

type CurrentFunc = {
  returnType: Type;
  upvalues: Map<string, Type>;
  outerScope: Scope<string, Type>;
};

export type FuncFields = {
  upvalues: Array<{ name: string; type: Type }>;
  block: CheckedStmt[];
  parameters: CheckedParam[];
};

export class CurrentFuncState {
  private currentFunc: CurrentFunc | null = null;
  funcReturnType() {
    if (!this.currentFunc) {
      throw new Error("cannot return from top level");
    }
    return this.currentFunc.returnType;
  }
  checkUpvalue(scope: Scope<string, Type>, name: string, type: Type) {
    if (!this.currentFunc) return;
    if (scope.isUpvalue(name, this.currentFunc.outerScope)) {
      this.currentFunc.upvalues.set(name, type);
    }
  }
  withFunc(
    returnType: Type,
    outerScope: Scope<string, Type>,
    fn: () => Pick<FuncFields, "parameters" | "block">
  ): FuncFields {
    const prevCurrentFunc = this.currentFunc;
    this.currentFunc = { returnType, upvalues: new Map(), outerScope };
    const { parameters, block } = fn();

    const upvalues = Array.from(this.currentFunc.upvalues.entries()).map(
      ([name, type]) => ({ name, type })
    );

    this.currentFunc = prevCurrentFunc;
    // propagate upvalues
    if (prevCurrentFunc) {
      for (const upval of upvalues) {
        if (outerScope.isUpvalue(upval.name, prevCurrentFunc.outerScope)) {
          prevCurrentFunc.upvalues.set(upval.name, upval.type);
        }
      }
    }
    return { upvalues, parameters, block };
  }
}
