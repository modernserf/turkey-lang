import { Binding, TypeParam } from "../types";
import { BlockScope } from "./block-scope";
import { Traits } from "./traits";
import {
  TypeVarMap,
  TypedBlock,
  TypedExpr,
  Type,
  createVar,
  funcType,
  BoundType,
  ExprAttrs,
} from "./types";

export class Func {
  constructor(private scope: BlockScope, private traits: Traits) {}
  declare(
    inTypeParameters: TypeParam[],
    inParameters: (vars: TypeVarMap) => Array<{ binding: Binding; type: Type }>,
    inReturnType: (vars: TypeVarMap) => Type
  ): {
    attrs: ExprAttrs;
    parameters: Array<{ binding: Binding; type: Type }>;
  } {
    const typeParams = inTypeParameters.map((p) => {
      const traits = p.traits.map((t) => {
        if (t.tag !== "identifier") throw new Error();
        if (t.typeArgs.length) throw new Error();
        return this.traits.get(t.value);
      });

      const type = createVar(Symbol(p.value), traits);
      return { name: p.value, type, traits };
    });
    const typeVarMap = new Map(typeParams.map((p) => [p.name, p.type]));
    const traitParameters = typeParams.flatMap((p) =>
      p.traits.map((trait) => ({ trait, type: p.type }))
    );
    const parameters = inParameters(typeVarMap);
    const returnType = inReturnType(typeVarMap);

    const type = funcType(
      parameters.map((p) => p.type),
      returnType
    );

    return {
      attrs: { type, funcInfo: { traitParameters } },
      parameters,
    };
  }
  compile(
    parameters: Array<{ binding: Binding; type: Type }>,
    attrs: ExprAttrs,
    inBlock: () => TypedBlock
  ): TypedExpr {
    // TODO: unify declared and inferred return type

    const { block, result } = this.scope.inScope(() => {
      // bind

      // while in this scope
      // bind generic vars to "tracer types",
      // and associate the trait impls that have been passed in with those types
      // so that they are found in subsequent lookups

      return inBlock();
    });

    return {
      tag: "func",
      parameters: attrs.parameters.map((p) => p.name),
      block,
      ...attrs,
    };
  }
  call(callee: TypedExpr, args: TypedExpr[]): TypedExpr {
    if (!callee.funcInfo) throw new Error("not callable");
    if (args.length !== callee.funcInfo.parameters.length) {
      throw new Error("invalid args");
    }

    const resolvedVars = new Map<symbol, BoundType>();
    callee.funcInfo.parameters.forEach((param, i) => {
      resolveVars(param.type, args[i].type, resolvedVars);
    });
    const traitArgs = callee.funcInfo.traitParameters.map((p) => {
      const resolvedType = resolvedVars.get(p.type.name);
      if (!resolvedType) throw new Error();
      return this.traits.getImpl(p.trait, resolvedType);
    });

    const returns = callee.funcInfo.returns;

    if (callee.builtIn) {
      return {
        tag: "builtin",
        code: callee.builtIn.code,
        args,
        traitArgs,
        ...returns,
      };
    }

    // TODO
    if (callee.trait) {
      return {
        tag: "builtin",
        code: traitArgs[0].attrs.builtIn?.code ?? [],
        args,
        traitArgs: [],
        ...returns,
      };
    }

    return { tag: "call", callee, args, traitArgs, ...returns };
  }
}

function resolveVars(
  param: Type,
  arg: Type,
  results: Map<symbol, BoundType>
): void {
  if (arg.tag !== "type") throw new Error();
  switch (param.tag) {
    case "var":
      // TODO: check for conflicts here
      results.set(param.name, arg);
      return;
    case "type":
      param.parameters.forEach((p, i) => {
        resolveVars(p, arg.parameters[i], results);
      });
      return;
  }
}
