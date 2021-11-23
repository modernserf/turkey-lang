import { Scope } from "./scope";
import { Binding, Expr, Opcode, Stmt, TypeExpr, TypeParam } from "./types";
import { CurrentFuncState, FuncFields } from "./current-func-2";
import { noMatch } from "./utils";

type TypeName = symbol;
type TraitName = TypeName;
type EnumTag = string;

type TypeVar = { tag: "var"; name: symbol; traits: BoundType[] };
type BoundType = { tag: "type"; name: TypeName; parameters: Type[] };
type Type = TypeVar | BoundType;

type FieldMap = Scope<string, { type: Type; index: number }>;

type FuncTypeNames = Map<number, TypeName>;
type TupleTypeNames = Map<number, TypeName>;

type Impl = { tag: "impl" };

class TraitImpls {
  private map: Map<TypeName, Map<TraitName, Impl>> = new Map();
  get(typeName: TypeName, traitName: TraitName): Impl | null {
    const traitMap = this.map.get(typeName);
    if (!traitMap) return null;
    return traitMap.get(traitName) ?? null;
  }
  init(typeName: TypeName, traitName: TraitName, impl: Impl): this {
    let traitMap = this.map.get(typeName);
    if (!traitMap) {
      traitMap = new Map<TraitName, Impl>();
      this.map.set(typeName, traitMap);
    }
    if (traitMap.has(traitName)) throw new Error("Duplicate trait impl");
    traitMap.set(traitName, impl);
    return this;
  }
}

class TypeCheckError extends Error {
  constructor(public left: BoundType, public right: BoundType) {
    super(
      `TypeCheckError: expected ${left.name.description}, received ${right.name.description}`
    );
  }
}

function typeVar(name: string, ...traits: BoundType[]): TypeVar {
  return { tag: "var", name: Symbol(name), traits };
}

function primitive(name: string): BoundType {
  return { tag: "type", name: Symbol(name), parameters: [] };
}

function trait(name: string): BoundType {
  const self = typeVar("Self");
  return { tag: "type", name: Symbol(name), parameters: [self] };
}

class Checker {
  private state: Map<symbol, Type> = new Map();
  constructor(private traitImpls: TraitImpls) {}
  unify(left: Type, right: Type): void {
    left = this.deref(left);
    right = this.deref(right);
    if (left.tag === "var") return this.assign(left, right);
    if (right.tag === "var") return this.assign(right, left);

    if (left.name !== right.name) throw new TypeCheckError(left, right);
    const rightParams = right.parameters;
    left.parameters.forEach((param, i) => this.unify(param, rightParams[i]));
  }
  mustResolve(tv: Type): BoundType {
    const res = this.resolve(tv);
    if (res.tag === "var") throw new Error("not resolved");
    return res;
  }
  resolve(tv: Type): Type {
    tv = this.deref(tv);
    if (tv.tag === "var") return tv;
    return {
      tag: "type",
      name: tv.name,
      parameters: tv.parameters.map((param) => this.resolve(param)),
    };
  }
  private assign(binding: TypeVar, tv: Type): void {
    // prevent a variable from assigning to itself
    if (tv.name === binding.name) return;
    // check traits
    if (tv.tag === "type") {
      for (const trait of binding.traits) {
        if (!this.traitImpls.get(tv.name, trait.name)) {
          throw new Error("Trait mismatch");
        }
      }
    } else {
      if (binding.traits.length) {
        throw new Error("TODO: unifying traits on vars");
      }
    }

    this.state.set(binding.name, tv);
  }
  private deref(tv: Type): Type {
    while (tv.tag === "var") {
      const next = this.state.get(tv.name);
      if (next) {
        tv = next;
      } else {
        return tv;
      }
    }
    return tv;
  }
}

type ForwardTypeContext = { checker: Checker; type: Type };
// used for cases where forward type does not need to be propagated
function checkContext(context: ForwardTypeContext | null, exprType: Type) {
  if (!context) return;
  context.checker.unify(context.type, exprType);
}
type CheckedExpr =
  | { tag: "primitive"; value: number; type: BoundType }
  | { tag: "string"; value: string; type: BoundType }
  | { tag: "enum"; index: number; fields: CheckedExpr[]; type: BoundType }
  | { tag: "struct"; fields: CheckedExpr[]; type: BoundType }
  | { tag: "identifier"; value: string; type: BoundType }
  | {
      tag: "closure";
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: BoundType;
    }
  | { tag: "field"; expr: CheckedExpr; index: number; type: BoundType }
  | { tag: "assign"; target: CheckedExpr; value: CheckedExpr; type: BoundType }
  | { tag: "builtIn"; opcode: Opcode; type: BoundType }
  | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[]; type: BoundType }
  | { tag: "do"; block: CheckedStmt[]; type: BoundType }
  | {
      tag: "if";
      cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
      elseBlock: CheckedStmt[];
      type: BoundType;
    }
  | {
      tag: "match";
      expr: CheckedExpr;
      cases: Map<string, CheckedMatchCase>;
      type: BoundType;
    };

type CheckedMatchCase = {
  index: number;
  bindings: CheckedStructFieldBinding[];
  block: CheckedStmt[];
};

type CheckedStmt =
  | { tag: "let"; binding: CheckedBinding; expr: CheckedExpr }
  | { tag: "return"; expr: CheckedExpr | null }
  | {
      tag: "func";
      name: string;
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: BoundType;
    }
  | { tag: "while"; expr: CheckedExpr; block: CheckedStmt[] }
  | {
      tag: "for";
      binding: CheckedBinding;
      expr: CheckedExpr;
      block: CheckedStmt[];
    }
  | { tag: "expr"; expr: CheckedExpr; hasValue: boolean };

type CheckedBinding =
  | { tag: "identifier"; value: string }
  | { tag: "struct"; fields: CheckedStructFieldBinding[] };

type CheckedStructFieldBinding = {
  fieldIndex: number;
  binding: CheckedBinding;
};

type CheckedParam = { binding: CheckedBinding; type: BoundType };
type CheckedUpvalue = { name: string; type: BoundType };
type CheckedBlock = { block: CheckedStmt[]; type: BoundType };

type BuiltIn = { tag: "builtIn"; opcode: Opcode; type: BoundType };

const intType = primitive("Int");
const floatType = primitive("Float");
const stringType = primitive("String");
const voidType = primitive("Void");
const boolType = primitive("Bool");
const numTrait = trait("Num");
const eqTrait = trait("Eq");

export function check(program: Stmt[]): CheckedStmt[] {
  return new ASTChecker().checkProgram(program);
}

type TypeConstructor =
  | { tag: "struct"; type: Type; fields: FieldMap }
  | { tag: "enum"; index: number; type: Type; fields: FieldMap };

class ASTChecker {
  private vars: Scope<string, BoundType> = new Scope();
  private types: Scope<string, Type> = new Scope();
  private builtins: Scope<string, BuiltIn> = new Scope();
  private funcTypeNames: FuncTypeNames = new Map();
  private tupleTypeNames: TupleTypeNames = new Map();
  private structFields: Map<TypeName, { type: BoundType; fields: FieldMap }> =
    new Map();
  private enumFields: Map<TypeName, Map<EnumTag, FieldMap>> = new Map();
  private typeConstructors: Scope<string, TypeConstructor> = new Scope();
  private traitImpls = new TraitImpls();
  private currentFunc = new CurrentFuncState<BoundType, Expr, CheckedExpr>();
  public checkProgram(program: Stmt[]): CheckedStmt[] {
    this.initPrelude();
    return this.checkBlock(program).block;
  }
  private checkBlock(block: Stmt[]): CheckedBlock {
    return this.inScope(() => {
      const checkedBlock = block
        .map((stmt) => this.checkStmt(stmt))
        .filter((stmt): stmt is CheckedStmt => !!stmt);
      const lastStmt = checkedBlock[checkedBlock.length - 1];
      if (lastStmt?.tag === "expr") {
        return { block: checkedBlock, type: lastStmt.expr.type };
      } else {
        return { block: checkedBlock, type: voidType };
      }
    });
  }
  private checkStmt(stmt: Stmt): CheckedStmt | null {
    switch (stmt.tag) {
      case "expr": {
        const expr = this.checkExpr(stmt.expr, null);
        return {
          tag: "expr",
          expr,
          hasValue: expr.type.name !== voidType.name,
        };
      }
      case "let": {
        const ctx = stmt.type
          ? {
              checker: new Checker(this.traitImpls),
              type: this.checkTypeExpr(stmt.type),
            }
          : null;
        const expr = this.checkExpr(stmt.expr, ctx);
        const binding = this.bindVars(stmt.binding, expr.type);

        return { tag: "let", expr, binding };
      }
      case "func": {
        const type = this.inScope(() => {
          for (const param of stmt.typeParameters) {
            this.types.init(param.value, typeVar(param.value));
          }
          return this.funcType(
            stmt.parameters.map((p) => this.checkTypeExpr(p.type)),
            this.checkTypeExpr(stmt.returnType)
          );
        });
        this.vars.init(stmt.name, type);

        const {
          upvalues,
          payload: { parameters, block },
        } = this.checkFunc(
          stmt.typeParameters,
          stmt.parameters,
          stmt.returnType,
          stmt.block
        );

        return {
          tag: "func",
          name: stmt.name,
          type,
          upvalues,
          parameters,
          block,
        };
      }
      case "return":
        return { tag: "return", expr: this.currentFunc.checkReturn(stmt.expr) };
      case "struct": {
        const name = stmt.binding.value;
        const { type, fields } = this.inScope(() => {
          const type: BoundType = {
            tag: "type",
            name: Symbol(name),
            parameters: stmt.binding.typeParameters.map((param) => {
              const t = typeVar(param.value);
              this.types.init(param.value, t);
              return t;
            }),
          };
          this.types.init(name, type);

          const fields: FieldMap = new Scope();
          stmt.fields.forEach((field, index) => {
            fields.init(field.fieldName, {
              index,
              type: this.checkTypeExpr(field.type),
            });
          });

          return { type, fields };
        });
        this.structFields.set(type.name, { type, fields });
        this.typeConstructors.init(name, { tag: "struct", type, fields });
        this.types.init(name, type);
        return null;
      }

      default:
        throw new Error("todo");
    }
  }
  private checkExpr(expr: Expr, ctx: ForwardTypeContext | null): CheckedExpr {
    switch (expr.tag) {
      case "integer":
        checkContext(ctx, intType);
        return { tag: "primitive", value: expr.value, type: intType };
      case "float":
        checkContext(ctx, floatType);
        return { tag: "primitive", value: expr.value, type: floatType };
      case "string":
        checkContext(ctx, stringType);
        return { tag: "string", value: expr.value, type: stringType };
      case "identifier":
        if (this.vars.has(expr.value)) {
          const type = this.vars.get(expr.value);
          this.currentFunc.checkUpvalue(this.vars, expr.value, type);
          checkContext(ctx, type);
          return { tag: "identifier", value: expr.value, type };
        } else {
          const builtIn = this.builtins.get(expr.value);
          checkContext(ctx, builtIn.type);
          return builtIn;
        }
      case "unaryOp": {
        const op = expr.operator === "-" ? "neg" : expr.operator;
        return this.checkCallExpr(this.builtins.get(op), [expr.expr], ctx);
      }
      case "binaryOp":
        return this.checkCallExpr(
          this.builtins.get(expr.operator),
          [expr.left, expr.right],
          ctx
        );
      case "call":
        return this.checkCallExpr(
          this.checkExpr(expr.expr, null),
          expr.args,
          ctx
        );
      case "typeConstructor": {
        const ctor = this.typeConstructors.get(expr.value);
        const checker = ctx?.checker ?? new Checker(this.traitImpls);

        // check types of fields & for correct overlap between types
        const concreteMap = new Scope<string, CheckedExpr>();
        for (const field of expr.fields) {
          const { type: ctorFieldType } = ctor.fields.get(field.fieldName);
          concreteMap.init(
            field.fieldName,
            this.checkExpr(field.expr, { checker, type: ctorFieldType })
          );
        }
        const checkedFields = Array.from(ctor.fields).map(([key]) =>
          concreteMap.get(key)
        );

        const type = checker.mustResolve(ctor.type);
        switch (ctor.tag) {
          case "struct":
            return { tag: "struct", fields: checkedFields, type };
          case "enum":
            return {
              tag: "enum",
              index: ctor.index,
              fields: checkedFields,
              type,
            };
          // istanbul ignore next
          default:
            return noMatch(ctor);
        }
      }
      case "field": {
        const checker = ctx?.checker ?? new Checker(this.traitImpls);
        const target = this.checkExpr(expr.expr, null);
        const fieldInfo = this.structFields.get(target.type.name);
        if (!fieldInfo) throw new Error("invalid field access");
        checker.unify(fieldInfo.type, target.type);
        const fieldData = fieldInfo.fields.get(expr.fieldName);
        const type = checker.mustResolve(fieldData.type);
        return { tag: "field", index: fieldData.index, expr: target, type };
      }
      default:
        throw new Error("todo");
    }
  }
  private checkTypeExpr(typeExpr: TypeExpr): Type {
    switch (typeExpr.tag) {
      case "identifier": {
        const baseType = this.types.get(typeExpr.value);
        if (!typeExpr.typeArgs.length) return baseType;
        const parameters = typeExpr.typeArgs.map((expr) =>
          this.checkTypeExpr(expr)
        );
        return { tag: "type", name: baseType.name, parameters };
      }
      case "func":
        return this.inScope(() => {
          for (const param of typeExpr.typeParameters) {
            this.types.init(param.value, typeVar(param.value));
          }
          return this.funcType(
            typeExpr.parameters.map((p) => this.checkTypeExpr(p)),
            this.checkTypeExpr(typeExpr.returnType)
          );
        });
      default:
        throw new Error("todo");
    }
  }
  private bindVars(binding: Binding, type: BoundType): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.vars.set(binding.value, type);
        return binding;
      case "struct":
        throw new Error("todo");
    }
  }
  private initPrelude(): void {
    this.types
      .init("Int", intType)
      .init("Float", floatType)
      .init("String", stringType)
      .init("Bool", boolType)
      .init("Void", voidType);
    // empty tuple is same type as void
    this.tupleTypeNames.set(0, voidType.name);

    this.typeConstructors
      .init("Void", {
        tag: "struct",
        fields: new Scope(),
        type: voidType,
      })
      .init("False", {
        tag: "enum",
        index: 0,
        fields: new Scope(),
        type: boolType,
      })
      .init("True", {
        tag: "enum",
        index: 1,
        fields: new Scope(),
        type: boolType,
      });

    this.traitImpls
      .init(intType.name, numTrait.name, { tag: "impl" })
      .init(floatType.name, numTrait.name, { tag: "impl" });

    // print(x), a == b go through traits system
    // though if the types can be determined statically, there is no "cost" for this
    this.initBuiltin("print_string", Opcode.PrintStr, [stringType], voidType)
      .initBuiltin("print_int", Opcode.PrintNum, [intType], voidType)
      .initBuiltin("print_float", Opcode.PrintNum, [floatType], voidType)
      .initBuiltin("eq_int", Opcode.Eq, [intType, intType], boolType)
      .initBuiltin("eq_float", Opcode.Eq, [floatType, floatType], boolType)
      .initBuiltin("eq_bool", Opcode.Eq, [boolType, boolType], boolType)
      .initBuiltin("!", Opcode.Not, [boolType], boolType);

    // arithmetic operators use traits for typechecking but are implemented as builtins directly
    const negT = typeVar("T", numTrait);
    this.initBuiltin("neg", Opcode.Neg, [negT], negT);
    const addT = typeVar("T", numTrait);
    this.initBuiltin("+", Opcode.Add, [addT, addT], addT);
    const subT = typeVar("T", numTrait);
    this.initBuiltin("-", Opcode.Sub, [subT, subT], subT);
    const ltT = typeVar("T", numTrait);
    this.initBuiltin("<", Opcode.Lt, [ltT, ltT], boolType);
  }
  private initBuiltin(
    name: string,
    opcode: Opcode,
    parameters: Type[],
    returnType: Type
  ): this {
    const type = this.funcType(parameters, returnType);
    this.builtins.init(name, { tag: "builtIn", opcode, type });
    return this;
  }
  private checkCallExpr(
    callee: CheckedExpr,
    args: Expr[],
    ctx: ForwardTypeContext | null
  ): CheckedExpr {
    const checker = ctx?.checker ?? new Checker(this.traitImpls);
    this.checkFuncArity(callee, args.length);
    const checkedArgs = args.map((arg, i) => {
      return this.checkExpr(arg, {
        checker,
        type: callee.type.parameters[i + 1],
      });
    });
    checkContext(ctx, callee.type.parameters[0]);
    const returnType = checker.mustResolve(callee.type.parameters[0]);

    return { tag: "call", callee, args: checkedArgs, type: returnType };
  }
  private checkFuncArity(callee: CheckedExpr, arity: number) {
    // the arity should already exist, because the callee has already been evaluated
    if (callee.type.name === this.funcTypeNames.get(arity)) return;
    throw new Error("Invalid func call");
  }
  private funcType(parameters: Type[], returnType: Type): BoundType {
    const arity = parameters.length;
    let typeName = this.funcTypeNames.get(arity);
    if (!typeName) {
      typeName = Symbol(`Func(${arity})`);
      this.funcTypeNames.set(arity, typeName);
    }
    return {
      tag: "type",
      name: typeName,
      parameters: [returnType, ...parameters],
    };
  }
  private inScope<T>(fn: () => T): T {
    this.vars = this.vars.push();
    this.types = this.types.push();
    try {
      return fn();
    } finally {
      this.vars = this.vars.pop();
      this.types = this.types.pop();
    }
  }
  private checkFunc(
    typeParameters: TypeParam[],
    parameters: Array<{ binding: Binding; type: TypeExpr }>,
    returnType: TypeExpr,
    rawBlock: Stmt[]
  ): FuncFields<
    BoundType,
    { block: CheckedStmt[]; parameters: CheckedParam[] }
  > {
    return this.inScope(() => {
      const outerScope = this.vars.pop();
      const checker = new Checker(this.traitImpls);
      const returnTypeVar = typeVar("Return");
      const checkReturnType = (expr: Expr | null) => {
        if (!expr) {
          checker.unify(returnTypeVar, voidType);
          return null;
        }
        return this.checkExpr(expr, { checker, type: returnTypeVar });
      };

      return this.currentFunc.withFunc(checkReturnType, outerScope, () => {
        // bind tracer types to type params
        // to ensure that they are not unified with anything else
        for (const param of typeParameters) {
          const type = primitive(`Trace(${param.value})`);
          this.types.init(param.value, type);
        }

        // add parameters to scope
        const checkedParams = parameters.map((param) => {
          const type = this.checkTypeExpr(param.type);
          // TODO: is there any good reason this might be unbound?
          if (type.tag === "var") throw new Error("unbound param in type args");
          const binding = this.bindVars(param.binding, type);
          return { type, binding };
        });

        // check function body
        const { block } = this.checkBlock(rawBlock);

        // handle explicit returns
        checker.unify(returnTypeVar, this.checkTypeExpr(returnType));

        // handle implicit returns
        const lastStmt = block.pop() ?? { tag: "noop" };
        switch (lastStmt.tag) {
          case "return":
            block.push(lastStmt);
            break;
          case "expr":
            checker.unify(returnTypeVar, lastStmt.expr.type);
            block.push({ tag: "return", expr: lastStmt.expr });
            break;
          case "noop":
            checker.unify(returnTypeVar, voidType);
            block.push({ tag: "return", expr: null });
            break;
          default:
            checker.unify(returnTypeVar, voidType);
            block.push(lastStmt);
            block.push({ tag: "return", expr: null });
            break;
        }

        return { parameters: checkedParams, block };
      });
    });
  }
}
