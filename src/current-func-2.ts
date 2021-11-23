import { Scope } from "./scope";

type CurrentFunc<Type, Expr, CheckedExpr> = {
  checkReturnType: (t: Expr | null) => CheckedExpr | null;
  upvalues: Map<string, Type>;
  outerScope: Scope<string, Type>;
};

export type FuncFields<Type, Payload> = {
  upvalues: Array<{ name: string; type: Type }>;
  payload: Payload;
};

export class CurrentFuncState<Type, Expr, CheckedExpr> {
  private currentFunc: CurrentFunc<Type, Expr, CheckedExpr> | null = null;
  checkReturn(expr: Expr | null): CheckedExpr | null {
    if (!this.currentFunc) {
      throw new Error("cannot return from top level");
    }
    return this.currentFunc.checkReturnType(expr);
  }
  checkUpvalue(scope: Scope<string, Type>, name: string, type: Type) {
    if (!this.currentFunc) return;
    if (scope.isUpvalue(name, this.currentFunc.outerScope)) {
      this.currentFunc.upvalues.set(name, type);
    }
  }
  withFunc<Payload>(
    checkReturnType: (expr: Expr | null) => CheckedExpr | null,
    outerScope: Scope<string, Type>,
    fn: () => Payload
  ): FuncFields<Type, Payload> {
    const prevCurrentFunc = this.currentFunc;
    this.currentFunc = { checkReturnType, upvalues: new Map(), outerScope };
    const payload = fn();

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
    return { upvalues, payload };
  }
}
