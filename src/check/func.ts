import { Scope } from "../scope";
import { Binding, Expr, Stmt, TypeExpr } from "../types";
import { resolveVar, unify, unifyParam } from "./checker";
import {
  Func as IFunc,
  TreeWalker,
  BlockScope,
  BoundType,
  TypedExpr,
  CheckedUpvalue,
  createType,
  voidType,
  funcType,
  funcTypeName,
  TypeParamScope,
  TypedStmt,
  Traits,
} from "./types";

type VarScope = Scope<string, BoundType>;

type CurrentFunc = {
  returnType: BoundType | null;
  upvalues: Map<string, BoundType>;
  outerScope: VarScope;
};

function unifyMaybe(left: BoundType | null, right: BoundType | null) {
  if (left && right) return unify(left, right);
  if (left) return left;
  if (right) return right;
  return voidType;
}

export class Func implements IFunc {
  public treeWalker!: TreeWalker;
  public scope!: BlockScope;
  public traits!: Traits;
  private currentFunc: CurrentFunc | null = null;
  createFunc(
    name: string,
    typeVars: TypeParamScope,
    inParams: Array<{ binding: Binding; type: TypeExpr }>,
    returnType: TypeExpr,
    inBlock: Stmt[]
  ): TypedStmt {
    // Type as used in rest of program, with type parameters as vars
    const type = this.scope.inScope(() => {
      return funcType(
        inParams.map((p) => this.treeWalker.typeExpr(p.type, typeVars)),
        this.treeWalker.typeExpr(returnType, typeVars)
      );
    });
    this.scope.initVar({ tag: "identifier", value: name }, type);

    return this.scope.inScope((outerScope) => {
      // Type used while checking func, with type parameters as unique types
      // so they can't be bound to anything else
      for (const [name, type] of typeVars) {
        const tracerType = createType(Symbol(`Trace_${name}`), [], type.traits);
        this.scope.initTypeAlias(name, tracerType);
      }

      const parameters = inParams.map((param) => {
        const type = this.treeWalker.typeExpr(param.type);
        // TODO: is there any good reason this might be unbound?
        if (type.tag === "var") throw new Error("unbound param in type args");
        const binding = this.scope.initVar(param.binding, type);
        return { type, binding };
      });

      const checkedReturnType = this.treeWalker.typeExpr(returnType);
      if (checkedReturnType.tag === "var") {
        throw new Error("invalid return type");
      }

      const { block, upvalues } = this.withCurrentFunc(
        checkedReturnType,
        outerScope,
        inBlock
      );

      const func: TypedExpr = {
        tag: "func",
        name,
        upvalues: upvalues.map((up) => up.name),
        parameters: parameters.map((p) => p.binding),
        block,
        type,
      };

      return {
        tag: "let",
        expr: func,
        binding: { tag: "identifier", value: name },
      };
    });
  }
  createClosure(
    inParameters: Binding[],
    inBlock: Stmt[],
    typeHint: BoundType | null
  ): TypedExpr {
    if (!typeHint) throw new Error("insufficient type info for closure");
    this.checkCalleeType(typeHint, inParameters.length);

    return this.scope.inScope((outerScope) => {
      const parameters = inParameters.map((param, i) => {
        const type = typeHint.parameters[i + 1];
        if (type.tag === "var") throw new Error("unbound param in type args");
        const binding = this.scope.initVar(param, type);
        return { type, binding };
      });

      let inReturnType: BoundType | null = null;
      if (typeHint.parameters[0].tag === "type") {
        inReturnType = typeHint.parameters[0];
      }

      const { block, upvalues, returnType } = this.withCurrentFunc(
        inReturnType,
        outerScope,
        inBlock
      );

      const type = funcType(
        parameters.map((p) => p.type),
        returnType
      );

      return {
        tag: "func",
        name: null,
        upvalues: upvalues.map((up) => up.name),
        parameters: parameters.map((p) => p.binding),
        block,
        type,
      };
    });
  }

  call(callee: TypedExpr, args: Expr[]): TypedExpr {
    this.checkCalleeType(callee.type, args.length);

    let resolvedType = callee.type;
    const checkedArgs = args.map((arg, i) => {
      const paramType = resolvedType.parameters[i + 1];
      const typeHint = paramType.tag === "type" ? paramType : null;
      const checkedExpr = this.treeWalker.expr(arg, typeHint);
      resolvedType = unifyParam(resolvedType, i + 1, checkedExpr.type);
      return checkedExpr;
    }, callee.type);

    const returnType = resolvedType.parameters[0];
    if (returnType.tag === "var") {
      throw new Error("unresolved return type");
    }

    return { tag: "call", callee, args: checkedArgs, type: returnType };
  }
  return(expr: Expr | null): TypedExpr | null {
    if (!this.currentFunc) throw new Error("cannot return from top level");
    if (expr) {
      const result = this.treeWalker.expr(expr, this.currentFunc.returnType);
      this.currentFunc.returnType = unifyMaybe(
        result.type,
        this.currentFunc.returnType
      );
      return { ...result, type: this.currentFunc.returnType };
    } else {
      this.currentFunc.returnType = unifyMaybe(
        voidType,
        this.currentFunc.returnType
      );
      return null;
    }
  }
  checkUpvalue(
    name: string,
    type: BoundType,
    isUpvalue: (scope: VarScope) => boolean
  ): void {
    if (!this.currentFunc) return;
    if (isUpvalue(this.currentFunc.outerScope)) {
      this.currentFunc.upvalues.set(name, type);
    }
  }
  private getImplicitReturn(block: TypedStmt[]): BoundType | null {
    const lastStmt = block.pop() ?? { tag: "noop" };
    switch (lastStmt.tag) {
      case "return":
        block.push(lastStmt);
        return null;
      case "expr":
        block.push({ tag: "return", expr: lastStmt.expr });
        return lastStmt.type;
      case "noop":
        block.push({ tag: "return", expr: null });
        return voidType;
      default:
        block.push(lastStmt);
        block.push({ tag: "return", expr: null });
        return voidType;
    }
  }
  private withCurrentFunc(
    inReturnType: BoundType | null,
    outerScope: VarScope,
    inBlock: Stmt[]
  ): {
    block: TypedStmt[];
    upvalues: CheckedUpvalue[];
    returnType: BoundType;
  } {
    const prevCurrentFunc = this.currentFunc;
    this.currentFunc = {
      returnType: inReturnType,
      upvalues: new Map(),
      outerScope,
    };

    const block = this.treeWalker.block(inBlock).block;
    const explicitReturn = this.currentFunc.returnType;
    const implicitReturn = this.getImplicitReturn(block);
    const returnType = unifyMaybe(explicitReturn, implicitReturn);

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

    // FIXME
    const upvaluesWithoutPrint = upvalues.filter((u) => u.name !== "print");

    return { upvalues: upvaluesWithoutPrint, block, returnType };
  }
  private checkCalleeType(type: BoundType, arity: number): void {
    if (type.name !== funcTypeName) {
      throw new Error("not a function");
    }
    if (type.parameters.length !== arity + 1) {
      throw new Error("arity mismatch");
    }
  }
  private handleParam(
    funcType: BoundType,
    paramIndex: number,
    expr: TypedExpr
  ): {
    resolvedType: BoundType;
    expr: TypedExpr;
  } {
    const paramType = funcType.parameters[paramIndex];

    if (paramType.tag === "var") {
      funcType = resolveVar(funcType, paramType.name, expr.type) as BoundType;
      expr = this.traits.boxValue(expr, paramType.traits);
    } else {
      // TODO: how will I recur over this?
    }

    return {
      resolvedType: funcType,
      expr,
    };
  }
}
