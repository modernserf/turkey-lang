import { Builtin, IRExpr } from "../ir";
import { Binding, Expr, Stmt } from "../ast";
import { Checker, CheckerProvider } from "./checker";
import {
  CheckedExpr,
  Func as IFunc,
  Scope,
  TreeWalker,
  funcTypeName,
  Type,
  voidType,
  TraitParam,
  createType,
  Trait,
  Traits,
  CheckedStmt,
} from "./types";

export class Func implements IFunc {
  constructor(
    private treeWalker: TreeWalker,
    private scope: Scope,
    private traits: Traits,
    private checker: CheckerProvider
  ) {}
  create(
    binding: symbol,
    typeParams: Array<{ type: Type; traits: Trait[] }>,
    inParameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    inBlock: Stmt[]
  ): CheckedStmt {
    // when creating the function _type_, we bind the type params to vars,
    // but when checking the function _body_, we bind them to unique concrete types,
    // so that they're not unified with anything else.
    const typeParamsWithTracers = typeParams.map(({ type, traits }) => {
      const tracer = createType(Symbol(`Trace(${type.name.description})`), []);
      return { type, traits, tracer };
    });

    const tracerTypes = new Map(
      typeParamsWithTracers.map(({ type, tracer }) => [type.name, tracer])
    );

    const checker = new Checker(this.traits, tracerTypes);
    const check = (type: Type) => checker.unify(type, returnType);

    const { upvalues: us, result } = this.scope.funcScope(check, () => {
      // the impls for the traits required by our type parameters are passed in as arguments.
      // this generates the symbols with which we'll bind these arguments,
      // and it defines the implementation of traits for our tracer types
      // as identifiers that point to those arguments.
      const traitParamSymbols = typeParamsWithTracers.flatMap(
        ({ type, tracer, traits }) => {
          return traits.map((trait) => {
            const id = Symbol(
              `impl_${type.name.description}_${trait.name.description}`
            );
            this.traits.provideImpl(tracer, trait, { tag: "local", value: id });
            return id;
          });
        }
      );

      // update the value params and return type to use the concrete type params
      // and get the symbols that the corresponding arguments will be bound to
      const mainParamSymbols = inParameters.map((p) => {
        const resolvedType = checker.resolve(p.type);
        return this.scope.initValue(p.binding, resolvedType);
      });
      const parameters = [
        ...traitParamSymbols,
        ...mainParamSymbols.map((b) => b.root),
      ];

      const blockHeader = mainParamSymbols.flatMap((b) => b.rest);
      const { block: blockBody } = this.treeWalker.block(inBlock);
      const block = [...blockHeader, ...blockBody];
      const blockReturnType = this.blockReturnType(block);
      if (blockReturnType) check(blockReturnType);
      return { parameters, block };
    });
    const { parameters, block } = result;
    const upvalues = us.map((value) => ({
      binding: value,
      expr: { tag: "local", value } as IRExpr,
    }));

    return { tag: "func", binding, upvalues, parameters, block };
  }
  createClosure(
    inParams: Binding[],
    inBlock: Stmt[],
    typeHint: Type
  ): CheckedExpr {
    const { returnType, params, traitParams } = this.checkCallee(
      typeHint,
      inParams.length
    );
    const checker = this.checker.create();
    const check = (type: Type) => checker.unify(type, returnType);

    const { upvalues: us, result } = this.scope.funcScope(check, () => {
      // not sure about this
      const traitParamSymbols = traitParams.map((_p) => {
        throw new Error("todo");
        // const id = Symbol(
        //   `impl_${p.type.name.description}_${p.trait.name.description}`
        // );
        // this.traits.provideImpl(p.type, p.trait, { tag: "local", value: id });
        // return id;
      });

      const mainParamSymbols = inParams.map((binding, i) => {
        return this.scope.initValue(binding, params[i]);
      });

      const parameters = [
        ...traitParamSymbols,
        ...mainParamSymbols.map((b) => b.root),
      ];

      const blockHeader = mainParamSymbols.flatMap((b) => b.rest);
      const { block: blockBody } = this.treeWalker.block(inBlock);
      const block = [...blockHeader, ...blockBody];
      const blockReturnType = this.blockReturnType(block);
      if (blockReturnType) check(blockReturnType);
      return { parameters, block };
    });

    const { parameters, block } = result;
    const upvalues = us.map((value) => ({
      binding: value,
      expr: { tag: "local", value } as IRExpr,
    }));

    return { tag: "func", upvalues, parameters, block, type: typeHint };
  }

  call(inCallee: Expr, inArgs: Expr[]): CheckedExpr {
    const callee = this.treeWalker.expr(inCallee, null);
    const { returnType, params, traitParams } = this.checkCallee(
      callee.type,
      inArgs.length
    );

    const checker = this.checker.create();

    // unify in args with callee params, resulting in fully bound callee
    const concreteArgs = inArgs.map((arg, i) => {
      const checkedArg = this.treeWalker.expr(arg, checker.resolve(params[i]));
      checkedArg.type = checker.unify(params[i], checkedArg.type);
      return checkedArg;
    });

    const implArgs = traitParams.map((param) => {
      return this.traits.getImpl(checker.resolve(param.type), param.trait);
    });

    const args = [...implArgs, ...concreteArgs];
    const finalReturnType = checker.resolve(returnType);
    const hasValue = this.hasValue(finalReturnType);
    return { tag: "call", callee, args, hasValue, type: finalReturnType };
  }
  op(op: Builtin, type: Type, inArgs: Expr[]): CheckedExpr {
    const { returnType, params } = this.checkCallee(type, inArgs.length);
    const checker = this.checker.create();
    const args = inArgs.map((arg, i) => {
      const checkedArg = this.treeWalker.expr(arg, checker.resolve(params[i]));
      checkedArg.type = checker.unify(params[i], checkedArg.type);
      return checkedArg;
    });
    const finalReturnType = checker.resolve(returnType);
    return { tag: "builtin", value: op, args, type: finalReturnType };
  }
  private checkCallee(
    type: Type,
    arity: number
  ): {
    returnType: Type;
    params: Type[];
    traitParams: TraitParam[];
  } {
    if (type.tag === "abstract") throw new Error();
    if (type.name !== funcTypeName) throw new Error();
    const [returnType, ...params] = type.parameters;
    if (params.length !== arity) throw new Error();
    return { returnType, params, traitParams: type.traitParams };
  }
  // TODO: this should go on Obj -- there can be void-like types which are not Void
  // e.g. a struct with no fields
  private hasValue(type: Type): boolean {
    if (type.tag === "abstract") throw new Error();
    if (type.name !== voidType.name) return true;
    return type.parameters.length > 0;
  }
  private blockReturnType(block: CheckedStmt[]): Type | null {
    if (block.length === 0) return voidType;
    const last = block[block.length - 1];
    switch (last.tag) {
      case "return":
        return null;
      case "expr":
        return last.type;
      default:
        return voidType;
    }
  }
}
