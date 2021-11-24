import { Scope } from "./scope";
import {
  Binding,
  Expr,
  Opcode,
  Stmt,
  StructFieldType,
  TypeBinding,
  TypeExpr,
  TypeParam,
  Type,
  TypeVar,
  BoundType,
  CheckedStmt,
  CheckedExpr,
  CheckedBinding,
  CheckedMatchCase,
  CheckedParam,
  CheckedStructFieldBinding,
} from "./types";
import { CurrentFuncState, FuncFields } from "./current-func-2";
import { noMatch } from "./utils";
import { Checker, makeType, primitive, trait, typeVar } from "./checker";
import { TraitImpls } from "./trait";

type TypeName = symbol;
type EnumTag = string;
type CheckedBlock = { block: CheckedStmt[]; type: BoundType };
type BuiltIn = { tag: "builtIn"; opcode: Opcode; type: BoundType };
type FieldMap = Scope<string, { type: Type; index: number }>;

export class ArityName {
  constructor(private prefix: string) {}
  private map: Map<number, symbol> = new Map();
  set(num: number, value: symbol) {
    this.map.set(num, value);
  }
  use(num: number): symbol {
    const res = this.map.get(num);
    if (res) return res;
    const sym = Symbol(`${this.prefix}(${num})`);
    this.map.set(num, sym);
    return sym;
  }
}

type ForwardTypeContext = { checker: Checker; type: Type };
// used for cases where forward type does not need to be propagated
function checkContext(context: ForwardTypeContext | null, exprType: Type) {
  if (!context) return;
  context.checker.unify(context.type, exprType);
}

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
  private types: Scope<string, BoundType> = new Scope();
  private builtins: Scope<string, BuiltIn> = new Scope();
  private funcTypeNames = new ArityName("Func");
  private tupleTypeNames = new ArityName("Tuple");
  private structFields: Map<TypeName, { type: BoundType; fields: FieldMap }> =
    new Map();
  private enumFields: Map<
    TypeName,
    {
      type: BoundType;
      cases: Map<EnumTag, { index: number; fields: FieldMap }>;
    }
  > = new Map();
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
        const typeVars = new Scope<string, TypeVar>();
        const type = this.inScope(() => {
          for (const param of stmt.typeParameters) {
            typeVars.init(param.value, typeVar(param.value));
          }
          return this.funcType(
            stmt.parameters.map((p) => this.checkTypeExpr(p.type, typeVars)),
            this.checkTypeExpr(stmt.returnType, typeVars)
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
        const { type, typeVars } = this.initComplexType(stmt.binding);
        const fields = this.buildFieldsMap(stmt.fields, typeVars);
        this.structFields.set(type.name, { type, fields });
        this.typeConstructors.init(stmt.binding.value, {
          tag: "struct",
          type,
          fields,
        });

        return null;
      }
      case "enum": {
        const { type, typeVars } = this.initComplexType(stmt.binding);
        const cases: Map<EnumTag, { index: number; fields: FieldMap }> =
          new Map();
        stmt.cases.forEach((enumCase, index) => {
          if (cases.has(enumCase.tagName)) throw new Error("duplicate tag");
          const fields = this.buildFieldsMap(enumCase.fields, typeVars);
          this.typeConstructors.init(enumCase.tagName, {
            tag: "enum",
            index,
            type,
            fields,
          });
          cases.set(enumCase.tagName, { index, fields });
        });
        this.enumFields.set(type.name, { type, cases });

        return null;
      }
      case "type": {
        const name = stmt.binding.value;
        const typeVars = new Scope<string, TypeVar>();

        stmt.binding.typeParameters.map((param) => {
          const t = typeVar(param.value);
          typeVars.init(param.value, t);
        });
        const type = this.checkTypeExpr(stmt.type, typeVars);
        if (type.tag === "var") throw new Error("invalid type definition");

        this.types.init(name, type);
        return null;
      }

      case "while":
      case "for":
        throw new Error("todo");
      // istanbul ignore next
      default:
        return noMatch(stmt);
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
        const checker = this.getChecker(null);

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
        checkContext(ctx, type);
        switch (ctor.tag) {
          case "struct":
            return { tag: "object", fields: checkedFields, type };
          case "enum":
            if (checkedFields.length) {
              return {
                tag: "object",
                fields: [
                  { tag: "primitive", value: ctor.index, type: intType },
                  ...checkedFields,
                ],
                type,
              };
            } else {
              return { tag: "primitive", value: ctor.index, type };
            }
          // istanbul ignore next
          default:
            return noMatch(ctor);
        }
      }
      case "field": {
        const target = this.checkExpr(expr.expr, null);
        const { index, type } = this.getField(
          this.getChecker(ctx),
          target.type,
          expr.fieldName
        );
        return { tag: "field", index, expr: target, type };
      }
      case "tuple": {
        const checker = this.getChecker(ctx);
        const abstractType = makeType(
          this.tupleTypeNames.use(expr.fields.length),
          expr.fields.map((_, i) => typeVar(String(i)))
        );
        checkContext(ctx, abstractType);

        const fields = expr.fields.map((field, i) => {
          return this.checkExpr(field.expr, {
            checker,
            type: abstractType.parameters[i],
          });
        });

        return {
          tag: "object",
          type: checker.mustResolve(abstractType),
          fields,
        };
      }
      case "closure": {
        if (!ctx) throw new Error("missing context");
        return this.checkClosure(ctx, expr.parameters, expr.block);
      }
      case "do": {
        const { block, type } = this.checkBlock(expr.block);
        checkContext(ctx, type);
        return { tag: "do", block, type };
      }
      case "match": {
        const target = this.checkExpr(expr.expr, null);
        const enumFields = this.enumFields.get(target.type.name);
        if (!enumFields) throw new Error("target is not an enum");

        const checker = this.getChecker(ctx);
        checker.unify(target.type, enumFields.type);

        const resultType = typeVar("Result");

        const checkedCases = new Map<
          string,
          {
            index: number;
            block: CheckedStmt[];
            bindings: CheckedStructFieldBinding[];
          }
        >();
        for (const matchCase of expr.cases) {
          if (checkedCases.has(matchCase.binding.value)) {
            throw new Error("duplicate case");
          }

          const caseInfo = enumFields.cases.get(matchCase.binding.value);
          if (!caseInfo) throw new Error("tag does not match enum");
          this.inScope(() => {
            const bindings = matchCase.binding.fields.map((bindField) => {
              const fieldInfo = caseInfo.fields.get(bindField.fieldName);
              const binding = this.bindVars(
                bindField.binding,
                checker.mustResolve(fieldInfo.type)
              );
              return { fieldIndex: fieldInfo.index, binding };
            });

            const { block, type } = this.checkBlock(matchCase.block);
            checker.unify(type, resultType);
            checkedCases.set(matchCase.binding.value, {
              index: caseInfo.index,
              block,
              bindings,
            });
          });
        }

        const cases: CheckedMatchCase[] = [];
        for (const [key] of enumFields.cases) {
          const checkedCase = checkedCases.get(key);
          if (!checkedCase) throw new Error("missing case");
          cases[checkedCase.index] = {
            block: checkedCase.block,
            bindings: checkedCase.bindings,
          };
        }

        const type = checker.mustResolve(resultType);
        checkContext(ctx, type);

        return {
          tag: "match",
          type,
          expr: target,
          cases,
        };
      }
      case "if": {
        const checker = this.getChecker(ctx);
        const resultType = typeVar("Result");

        const checkedCases = expr.cases.map((ifCase) => {
          const predicate = this.checkExpr(ifCase.predicate, null);
          checker.unify(predicate.type, boolType);

          const { block, type } = this.checkBlock(ifCase.block);
          checker.unify(resultType, type);
          return { predicate, block };
        });

        const { block: elseBlock, type: elseType } = this.checkBlock(
          expr.elseBlock
        );
        checker.unify(resultType, elseType);
        const type = checker.mustResolve(resultType);
        checkContext(ctx, type);

        return {
          tag: "if",
          cases: checkedCases,
          elseBlock,
          type,
        };
      }
      case "list":
        throw new Error("todo");
      // istanbul ignore next
      default:
        return noMatch(expr);
    }
  }
  private checkTypeExpr(
    typeExpr: TypeExpr,
    vars: Scope<string, TypeVar> = new Scope()
  ): Type {
    switch (typeExpr.tag) {
      case "identifier": {
        const baseType = vars.has(typeExpr.value)
          ? vars.get(typeExpr.value)
          : this.types.get(typeExpr.value);
        if (!typeExpr.typeArgs.length) return baseType;
        const parameters = typeExpr.typeArgs.map((expr) =>
          this.checkTypeExpr(expr, vars)
        );
        return makeType(baseType.name, parameters);
      }
      case "func": {
        vars = vars.push();
        for (const param of typeExpr.typeParameters) {
          vars.init(param.value, typeVar(param.value));
        }
        return this.funcType(
          typeExpr.parameters.map((p) => this.checkTypeExpr(p, vars)),
          this.checkTypeExpr(typeExpr.returnType, vars)
        );
      }
      case "tuple":
        return makeType(
          this.tupleTypeNames.use(typeExpr.typeArgs.length),
          typeExpr.typeArgs.map((t) => this.checkTypeExpr(t))
        );
    }
  }
  private bindVars(binding: Binding, type: BoundType): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.vars.set(binding.value, type);
        return binding;
      case "struct": {
        // TODO: check for complete tuples
        const checker = this.getChecker(null);
        const fields = binding.fields.map((b) => {
          const fieldInfo = this.getField(checker, type, b.fieldName);
          const binding = this.bindVars(b.binding, fieldInfo.type);
          return {
            fieldName: b.fieldName,
            fieldIndex: fieldInfo.index,
            binding,
          };
        });
        return { tag: "struct", fields };
      }
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
      .init(floatType.name, numTrait.name, { tag: "impl" })
      .init(intType.name, eqTrait.name, { tag: "impl" })
      .init(floatType.name, eqTrait.name, { tag: "impl" })
      .init(boolType.name, eqTrait.name, { tag: "impl" });

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
    const numT = typeVar("T", numTrait);
    this.initBuiltin("neg", Opcode.Neg, [numT], numT)
      .initBuiltin("+", Opcode.Add, [numT, numT], numT)
      .initBuiltin("-", Opcode.Sub, [numT, numT], numT)
      .initBuiltin("*", Opcode.Mul, [numT, numT], numT)
      .initBuiltin("%", Opcode.Mod, [numT, numT], numT)
      .initBuiltin("/", Opcode.Div, [numT, numT], floatType)
      .initBuiltin("<", Opcode.Lt, [numT, numT], boolType)
      .initBuiltin(">", Opcode.Gt, [numT, numT], boolType)
      .initBuiltin("<=", Opcode.Lte, [numT, numT], boolType)
      .initBuiltin(">=", Opcode.Gte, [numT, numT], boolType);

    // TODO: check impls of Eq trait instead of using builtin
    const eqT = typeVar("T", eqTrait);
    this.initBuiltin("==", Opcode.Eq, [eqT, eqT], boolType) //
      .initBuiltin("!=", Opcode.Neq, [eqT, eqT], boolType);
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
    const checker = this.getChecker(ctx);
    this.checkFuncArity(callee.type, args.length);
    const calleeType = this.freshTypeVars(callee.type) as BoundType;
    const checkedArgs = args.map((arg, i) => {
      return this.checkExpr(arg, {
        checker,
        type: calleeType.parameters[i + 1],
      });
    });
    checkContext(ctx, calleeType.parameters[0]);
    const returnType = checker.mustResolve(calleeType.parameters[0]);

    return { tag: "call", callee, args: checkedArgs, type: returnType };
  }
  private checkFuncArity(type: Type, arity: number): BoundType {
    if (type.tag === "type" && type.name === this.funcTypeNames.use(arity)) {
      return type;
    }
    throw new Error("Invalid func call");
  }
  private funcType(parameters: Type[], returnType: Type): BoundType {
    const arity = parameters.length;
    return makeType(this.funcTypeNames.use(arity), [returnType, ...parameters]);
  }
  private inScope<T>(fn: () => T): T {
    this.vars = this.vars.push();
    this.types = this.types.push();
    const res = fn();
    this.vars = this.vars.pop();
    this.types = this.types.pop();
    return res;
  }
  private checkClosure(
    ctx: ForwardTypeContext,
    parameters: Binding[],
    block: Stmt[]
  ): CheckedExpr {
    const funcType = this.checkFuncArity(ctx.type, parameters.length);
    return this.inScope(() => {
      const outerScope = this.vars.pop();
      const returnTypeVar = typeVar("Return");
      const checkReturnType = (expr: Expr | null) => {
        if (!expr) {
          ctx.checker.unify(returnTypeVar, voidType);
          return null;
        }
        return this.checkExpr(expr, {
          checker: ctx.checker,
          type: returnTypeVar,
        });
      };

      const {
        upvalues,
        payload: { checkedBlock, checkedParams },
      } = this.currentFunc.withFunc(checkReturnType, outerScope, () => {
        // add parameters to scope
        const checkedParams = parameters.map((param, i) => {
          // Dubious of this bit here
          const type = ctx.checker.mustResolve(funcType.parameters[i + 1]);
          const binding = this.bindVars(param, type);
          return { type, binding };
        });

        const { block: checkedBlock } = this.checkBlock(block);
        this.handleReturns(ctx.checker, checkedBlock, returnTypeVar);

        const outType = this.funcType(
          checkedParams.map((p) => p.type),
          returnTypeVar
        );

        ctx.checker.unify(funcType, outType);
        return { checkedBlock, checkedParams };
      });

      return {
        tag: "closure",
        parameters: checkedParams,
        upvalues,
        block: checkedBlock,
        type: ctx.checker.mustResolve(funcType),
      };
    });
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
        // bind a tracer type to type params
        // to ensure that they are not unified with anything else
        // they can, however, bind to each other (?)
        const type = primitive(`Trace`);
        for (const param of typeParameters) {
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

        const { block } = this.checkBlock(rawBlock);
        checker.unify(returnTypeVar, this.checkTypeExpr(returnType));
        this.handleReturns(checker, block, returnTypeVar);

        return { parameters: checkedParams, block };
      });
    });
  }
  private handleReturns(
    checker: Checker,
    block: CheckedStmt[],
    returnTypeVar: TypeVar
  ) {
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
  }
  // TODO: it seems likely that _most_ of the time, we should pass `null` in here
  private getChecker(ctx: ForwardTypeContext | null): Checker {
    return ctx?.checker ?? new Checker(this.traitImpls);
  }
  private getField(
    checker: Checker,
    targetType: BoundType,
    fieldName: string
  ): { index: number; type: BoundType } {
    // const checker = this.getChecker(ctx);
    const isTuple =
      targetType.name === this.tupleTypeNames.use(targetType.parameters.length);

    if (isTuple) {
      const index = Number(fieldName);
      const type = targetType.parameters[index];
      if (!type) throw new Error("invalid field access");
      return { index, type: checker.mustResolve(type) };
    }

    const fieldInfo = this.structFields.get(targetType.name);
    if (!fieldInfo) throw new Error("invalid field access");
    checker.unify(fieldInfo.type, targetType);
    const fieldData = fieldInfo.fields.get(fieldName);
    const type = checker.mustResolve(fieldData.type);
    return { index: fieldData.index, type };
  }
  private initComplexType(binding: TypeBinding) {
    const name = binding.value;
    const typeVars = new Scope<string, TypeVar>();

    const type = makeType(
      Symbol(name),
      binding.typeParameters.map((param) => {
        const t = typeVar(param.value);
        typeVars.init(param.value, t);
        return t;
      })
    );
    this.types.init(name, type);
    return { type, typeVars };
  }
  private buildFieldsMap(
    structFields: StructFieldType[],
    typeVars: Scope<string, TypeVar>
  ): FieldMap {
    const fields: FieldMap = new Scope();
    structFields.forEach((field, index) => {
      fields.init(field.fieldName, {
        index,
        type: this.checkTypeExpr(field.type, typeVars),
      });
    });
    return fields;
  }
  // TODO: I think instead of this, I need to apply some concept of "scope" to type vars
  private freshTypeVars(type: Type, map = new Map<symbol, TypeVar>()): Type {
    switch (type.tag) {
      case "var": {
        const found = map.get(type.name);
        if (found) return found;
        const newType = typeVar(type.name.description ?? "", ...type.traits);
        map.set(type.name, newType);
        return newType;
      }
      case "type":
        return makeType(
          type.name,
          type.parameters.map((t) => this.freshTypeVars(t, map))
        );
    }
  }
}
