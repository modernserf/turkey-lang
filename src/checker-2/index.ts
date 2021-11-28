import { Writer } from "../writer";
import {
  intType,
  stringType,
  funcType,
  createVar,
  BoundType,
  Trait,
  TypeVar,
  Type,
  voidType,
  showTrait,
} from "../check/types";
import { ValueWithSource, Scope } from "../scope";
import { Binding, Expr, Opcode, Stmt, TypeExpr, TypeParam } from "../types";
import { noMatch } from "../utils";

type BaseTypedExpr =
  | { tag: "primitive"; value: number }
  | { tag: "string"; value: string }
  | { tag: "root"; value: string }
  | { tag: "upvalue"; value: string }
  | { tag: "local"; value: string }
  | { tag: "call"; callee: TypedExpr; args: BaseTypedExpr[]; traitArgs: Impl[] }
  | { tag: "builtin"; code: Opcode[]; args: BaseTypedExpr[]; traitArgs: Impl[] }
  | { tag: "func" };

type ExprAttrs = {
  type: BoundType;
  // can be on func or any expr that produces func
  funcInfo?: {
    traitParameters: Array<{ trait: Trait; type: TypeVar }>;
    parameters: Array<{ name: string; type: Type }>;
    returns: ExprAttrs;
    block: TypedStmt[];
  };
  builtIn?: {
    code: Opcode[];
  };
  trait?: {
    todo: boolean;
  };
};

type TypedExpr = BaseTypedExpr & ExprAttrs;

type TypedStmt =
  | { tag: "let"; name: string; expr: TypedExpr }
  | { tag: "expr"; expr: TypedExpr; type: BoundType };

type TypedBlock = { block: TypedStmt[]; result: ExprAttrs };

export class TreeWalker {
  public func!: Func;
  public scope!: BlockScope;
  public program(program: Stmt[]): TypedStmt[] {
    return this.block(program).block;
  }
  public block(inBlock: Stmt[]): TypedBlock {
    const block = inBlock.flatMap((stmt) => this.stmt(stmt));
    const lastStmt = block[block.length - 1];
    if (lastStmt?.tag === "expr") {
      return { block, result: lastStmt.expr };
    } else {
      return { block, result: { type: voidType } };
    }
  }
  public expr(expr: Expr): TypedExpr {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, type: intType };
      case "string":
        return { tag: "string", value: expr.value, type: stringType };
      case "identifier": {
        const { tag, value } = this.scope.getValue(expr.value);
        return { tag, value: expr.value, ...value };
      }
      case "call": {
        const callee = this.expr(expr.expr);
        const args = expr.args.map((arg) => this.expr(arg));
        return this.func.call(callee, args);
      }
      default:
        throw new Error("not here");
    }
  }
  public typeExpr(type: TypeExpr, vars: Map<string, TypeVar>): Type {
    if (type.tag !== "identifier") throw new Error();
    return this.scope.getType(type.value, vars);
  }
  private stmt(stmt: Stmt): TypedStmt[] {
    switch (stmt.tag) {
      case "let": {
        if (stmt.binding.tag !== "identifier") throw new Error();
        const expr = this.expr(stmt.expr);
        this.scope.initValue(stmt.binding.value, expr);
        return [{ tag: "let", expr, name: stmt.binding.value }];
      }
      case "func":
        throw new Error("todo");
      case "expr": {
        const expr = this.expr(stmt.expr);
        return [{ tag: "expr", expr, type: expr.type }];
      }
      default:
        throw new Error("not here");
    }
  }
}

export class Func {
  public scope!: BlockScope;
  public treeWalker!: TreeWalker;
  public traits!: Traits;
  define(
    inTypeParameters: TypeParam[],
    inParameters: Array<{ binding: Binding; type: TypeExpr }>,
    inReturnType: TypeExpr,
    inBlock: Stmt[]
  ): TypedExpr {
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
    const parameters = inParameters.map((p) => {
      if (p.binding.tag !== "identifier") throw new Error();
      return {
        name: p.binding.value,
        type: this.treeWalker.typeExpr(p.type, typeVarMap),
      };
    });

    const returnType = this.treeWalker.typeExpr(inReturnType, typeVarMap);
    const type = funcType(
      parameters.map((p) => p.type),
      returnType
    );
    // TODO: unify declared and inferred return type

    const { block, result } = this.scope.inScope(() => {
      return this.treeWalker.block(inBlock);
    });

    return {
      tag: "func",
      type,
      funcInfo: { traitParameters, parameters, block, returns: result },
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
    console.log(resolvedVars, callee.funcInfo.parameters, args);
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

export class BlockScope {
  private values: Scope<string, ExprAttrs> = new Scope();
  private types: Scope<string, BoundType> = new Scope();
  constructor(stdlib: StdLib) {
    stdlib.values.forEach(({ name, attrs }) => {
      this.values.init(name, attrs);
    });
  }
  getValue(name: string): ValueWithSource<ExprAttrs> {
    return this.values.getWithSource(name);
  }
  initValue(name: string, value: ExprAttrs): void {
    this.values.set(name, value);
  }
  getType(name: string, typeVars: Map<string, TypeVar>): Type {
    const found = typeVars.get(name);
    if (found) return found;
    return this.types.get(name);
  }
  inScope<T>(cb: () => T): T {
    this.values = this.values.push();
    this.types = this.types.push();
    const res = cb();
    this.types = this.types.pop();
    this.values = this.values.pop();
    return res;
  }
}

type Impl = { tag: "impl"; attrs: ExprAttrs };

export class Traits {
  private traitNames: Map<string, Trait> = new Map();
  private traitImpls: Map<symbol, Map<symbol, Impl>> = new Map();
  constructor(stdlib: StdLib) {
    stdlib.impls.forEach((row) => {
      const typeMap = new Map(
        row.impls.map((impl) => [
          impl.type.name,
          { tag: "impl" as const, attrs: impl.attrs },
        ])
      );
      this.traitImpls.set(row.trait.name, typeMap);
    });
  }
  get(name: string): Trait {
    const found = this.traitNames.get(name);
    if (!found) throw new Error();
    return found;
  }
  getImpl(trait: Trait, type: BoundType): Impl {
    const impls = this.traitImpls.get(trait.name);
    if (!impls) throw new Error();
    const impl = impls.get(type.name);
    if (!impl) throw new Error();
    return impl;
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

export class Compiler {
  private asm = new Writer();
  private vars = new Scope<string, number>();
  private strings = new Map<string, number>();
  constructor(stdlib: StdLib) {
    // stdlib.values.forEach(({ name, expr }, i) => {
    //   this.expr(expr);
    //   this.vars.init(name, i);
    // });
  }
  program(program: TypedStmt[]): {
    program: number[];
    constants: string[];
  } {
    for (const stmt of program) {
      this.stmt(stmt);
    }

    this.asm.halt();

    return {
      program: this.asm.compile(),
      constants: this.getConstants(),
    };
  }
  // private block(block: TypedStmt[]) {
  //   block.forEach((stmt) => {
  //     this.stmt(stmt);
  //   });
  // }
  private stmt(stmt: TypedStmt): void {
    switch (stmt.tag) {
      case "expr":
        this.expr(stmt.expr);
        return;
      case "let": {
        this.expr(stmt.expr);
        const index = this.vars.size;
        this.vars.set(stmt.name, index);
        return;
      }
      default:
        noMatch(stmt);
    }
  }
  private expr(expr: BaseTypedExpr): void {
    switch (expr.tag) {
      case "primitive":
        this.asm.loadPrimitive(expr.value);
        return;
      case "string":
        this.asm.loadPointer(this.useString(expr.value));
        return;
      case "root":
        this.asm.loadRoot(this.vars.get(expr.value));
        return;
      case "local":
        this.asm.loadLocal(this.vars.get(expr.value));
        return;
      case "builtin":
        expr.traitArgs.forEach(() => {
          throw new Error("todo");
        });
        expr.args.forEach((arg) => {
          this.expr(arg);
        });
        this.asm.writeOpcode(...expr.code);
        return;
      case "call":
      case "func":
      case "upvalue":
        throw new Error("todo");
      default:
        noMatch(expr);
    }
  }
  useString(str: string) {
    if (this.strings.has(str)) {
      return this.strings.get(str) as number;
    }
    this.strings.set(str, this.strings.size + 1);
    return this.strings.size + 1;
  }
  getConstants(): string[] {
    return Array.from(this.strings.keys());
  }
}

type StdLib = {
  values: Array<{ name: string; attrs: ExprAttrs }>;
  impls: Array<{
    trait: Trait;
    impls: Array<{ type: BoundType; attrs: ExprAttrs }>;
  }>;
};

// traitParameters: Array<{ trait: Trait; type: TypeVar }>;
//     parameters: Array<{ name: string; type: Type }>;
//     returns: ExprAttrs;
//     block: TypedStmt[];

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

const treeWalker = new TreeWalker();
const scope = new BlockScope(stdlib);
const func = new Func();
const traits = new Traits(stdlib);
treeWalker.scope = scope;
treeWalker.func = func;
func.scope = scope;
func.treeWalker = treeWalker;
func.traits = traits;

export function compile(program: Stmt[]) {
  return new Compiler(stdlib).program(treeWalker.program(program));
}
