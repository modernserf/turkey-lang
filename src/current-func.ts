import { CheckedStmt, CheckedParam } from "./types";
import { Scope } from "./scope";

type CurrentFunc<T> = {
  returnType: T;
  upvalues: Map<string, T>;
  outerScope: Scope<string, T>;
};

export type FuncFields<T> = {
  upvalues: Array<{ name: string; type: T }>;
  block: CheckedStmt[];
  parameters: CheckedParam[];
};

export class CurrentFuncState<T> {
  private currentFunc: CurrentFunc<T> | null = null;
  funcReturnType() {
    if (!this.currentFunc) {
      throw new Error("cannot return from top level");
    }
    return this.currentFunc.returnType;
  }
  checkUpvalue(scope: Scope<string, T>, name: string, type: T) {
    if (!this.currentFunc) return;
    if (scope.isUpvalue(name, this.currentFunc.outerScope)) {
      this.currentFunc.upvalues.set(name, type);
    }
  }
  withFunc(
    returnType: T,
    outerScope: Scope<string, T>,
    fn: () => Pick<FuncFields<T>, "parameters" | "block">
  ): FuncFields<T> {
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
