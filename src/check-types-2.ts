import { CurrentFuncState, FuncFields } from "./current-func";
import { Scope } from "./scope";
import { TypeChecker } from "./type-scope-4";
import {
  Binding,
  Expr,
  Stmt,
  TypeExpr,
  Trait,
  Type,
  ValueType,
  CheckedExpr,
  CheckedStmt,
  CheckedBinding,
  Opcode,
  TypeParam,
  CheckedMatchCase,
} from "./types";
import { noMatch } from "./utils";
import { StructFields, Case, ArityName } from "./fields";

const primitive = (name: string, ...traits: Trait[]) =>
  TypeChecker.createValue(Symbol(name), [], traits);

const numTrait = TypeChecker.createTrait("Num");
const debugTrait = TypeChecker.createTrait("Debug");
const eqTrait = TypeChecker.createTrait("Eq");

const voidType = primitive("Void");
const intType = primitive("Int", numTrait, debugTrait, eqTrait);
const floatType = primitive("Float", numTrait, debugTrait, eqTrait);
const stringType = primitive("String", debugTrait, eqTrait);
const boolType = primitive("Bool", eqTrait);

const listItemVar = TypeChecker.createVar("ListItem");
const listType = TypeChecker.createValue(Symbol("List"), [listItemVar], []);
const listNil = new Case(listType, true, 0);
const listCons = new Case(listType, true, 1)
  .addConcreteField("0", listItemVar)
  .addConcreteField("1", listType);

export function check(program: Stmt[]): CheckedStmt[] {
  return Thing.checkProgram(program);
}

export class Thing {
  private vars: Scope<string, Type>;
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, Case>;
  private currentFunc = new CurrentFuncState<Type>();
  private funcTypes = new ArityName("func");
  private structFields = new StructFields();
  static checkProgram(program: Stmt[]): CheckedStmt[] {
    return new Thing().checkBlock(program).block;
  }
  constructor() {
    this.vars = new Scope();
    this.types = new Scope();
    this.typeConstructors = new Scope();
    this.types
      .init("Void", voidType)
      .init("Int", intType)
      .init("Float", floatType)
      .init("String", stringType)
      .init("Bool", boolType)
      .init("List", listType);
    this.typeConstructors
      .init("False", new Case(boolType, false, 0))
      .init("True", new Case(boolType, false, 1))
      .init("Nil", listNil)
      .init("Cons", listCons);
  }
  private checkBlock(block: Stmt[]): { block: CheckedStmt[]; type: Type } {
    const checkedBlock: CheckedStmt[] = [];
    let type: Type = voidType;
    this.inScope(() => {
      for (const stmt of block) {
        const checkedStmt = this.checkStmt(stmt);
        if (!checkedStmt) {
          type = voidType;
          continue;
        }
        checkedBlock.push(checkedStmt);
        if (checkedStmt.tag === "expr") {
          type = checkedStmt.expr.type;
        } else {
          type = voidType;
        }
      }
    });
    return { block: checkedBlock, type };
  }
  private checkStmt(stmt: Stmt): CheckedStmt | null {
    switch (stmt.tag) {
      case "type": {
        this.initType(stmt.binding.value, () =>
          this.withTypeParams(stmt.binding.typeParameters, () =>
            this.checkTypeExpr(stmt.type)
          )
        );
        return null;
      }
      case "enum": {
        this.initType(stmt.binding.value, () => {
          const { type, casesMap } = this.withTypeParams(
            stmt.binding.typeParameters,
            (typeParams) => {
              return this.structFields.initEnum(
                stmt.binding.value,
                typeParams,
                stmt.cases.map((c) => ({
                  tagName: c.tagName,
                  isTuple: c.isTuple,
                  fields: c.fields.map((field) => ({
                    fieldName: field.fieldName,
                    type: this.checkTypeExpr(field.type),
                  })),
                })),
                [eqTrait]
              );
            }
          );

          for (const [tagName, enumCase] of casesMap) {
            this.typeConstructors.init(tagName, enumCase);
          }
          return type;
        });
        return null;
      }
      case "struct": {
        this.initType(stmt.binding.value, () => {
          const structCase = this.withTypeParams(
            stmt.binding.typeParameters,
            (typeParams) => {
              return this.structFields.initStruct(
                stmt.binding.value,
                typeParams,
                stmt.fields.map((field) => ({
                  fieldName: field.fieldName,
                  type: this.checkTypeExpr(field.type),
                })),
                stmt.isTuple
              );
            }
          );

          this.typeConstructors.init(stmt.binding.value, structCase);
          return structCase.type;
        });
        return null;
      }
      case "expr": {
        const expr = this.checkExpr(stmt.expr, null);
        return {
          tag: "expr",
          expr,
          hasValue: expr.type.name !== voidType.name,
        };
      }
      case "let": {
        const checker = new TypeChecker();
        const forwardType = stmt.type ? this.checkTypeExpr(stmt.type) : null;
        const expr = this.checkExpr(stmt.expr, forwardType);
        if (forwardType) {
          checker.unify(expr.type, forwardType);
        }
        expr.type = checker.resolve(expr.type);

        const binding = this.initScopeBinding(stmt.binding, expr.type);
        return { tag: "let", binding, expr };
      }
      case "return": {
        const returnType = this.currentFunc.funcReturnType();
        const checker = new TypeChecker();

        if (!stmt.expr) {
          checker.unify(voidType, returnType);
          return { tag: "return", expr: null };
        }
        const expr = this.checkExpr(stmt.expr, returnType);
        checker.unify(returnType, expr.type);
        return { tag: "return", expr };
      }
      case "while": {
        const predicate = this.checkExpr(stmt.expr, null);
        new TypeChecker().unify(predicate.type, boolType);
        const { block } = this.checkBlock(stmt.block);
        return { tag: "while", expr: predicate, block };
      }
      case "for": {
        const list = this.checkExpr(stmt.expr, null);
        const checker = new TypeChecker();
        checker.unify(list.type, listType);
        const itemType = checker.resolve(listType.matchTypes[0]);
        return this.inScope(() => {
          const binding = this.initScopeBinding(stmt.binding, itemType);
          const { block } = this.checkBlock(stmt.block);
          return { tag: "for", expr: list, binding, block };
        });
      }
      case "func": {
        const type = this.funcType(
          stmt.typeParameters,
          stmt.parameters.map((p) => p.type),
          stmt.returnType
        );
        this.vars.init(stmt.name, type);

        const rawParams = stmt.parameters.map(({ binding }, i) => ({
          binding,
          type: type.matchTypes[i + 1],
        }));

        return {
          tag: "func",
          name: stmt.name,
          type,
          ...this.checkFunc(rawParams, type.matchTypes[0], stmt.block),
        };
      }
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
  private checkExpr(expr: Expr, forwardType: Type | null): CheckedExpr {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, type: intType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
      case "string":
        return { tag: "string", value: expr.value, type: stringType };
      case "identifier": {
        const type = this.vars.get(expr.value);
        this.currentFunc.checkUpvalue(this.vars, expr.value, type);
        return { tag: "identifier", value: expr.value, type };
      }
      case "tuple": {
        const fields = expr.fields.map((field) =>
          this.checkExpr(field.expr, null)
        );
        const type = this.structFields.initTuple(
          fields.map((expr) => expr.type)
        );
        return { tag: "struct", type, fields };
      }
      case "list": {
        type T = Expr & { tag: "typeConstructor" };
        const ast = expr.items.reduceRight(
          (acc: T, expr) => {
            return {
              tag: "typeConstructor",
              value: "Cons",
              fields: [
                { fieldName: "0", expr },
                { fieldName: "1", expr: acc },
              ],
            };
          },
          { tag: "typeConstructor", value: "Nil", fields: [] }
        );

        if (ast.value === "Nil") {
          // istanbul ignore next
          return listNil.construct([], (expr, fwd) =>
            this.checkExpr(expr, fwd)
          );
        } else {
          return listCons.construct(ast.fields, (expr, fwd) =>
            this.checkExpr(expr, fwd)
          );
        }
      }
      case "do": {
        const { block, type } = this.checkBlock(expr.block);
        return { tag: "do", block, type };
      }
      case "if": {
        const cases = expr.cases.map((ifCase) => {
          const predicate = this.checkExpr(ifCase.predicate, null);
          new TypeChecker().unify(boolType, predicate.type);
          const { block, type } = this.checkBlock(ifCase.block);
          return { predicate, block, type };
        });
        const { block: elseBlock, type: elseType } = this.checkBlock(
          expr.elseBlock
        );
        const checker = new TypeChecker();
        for (const { type: caseType } of cases) {
          checker.unify(caseType, elseType);
        }
        const type = checker.resolve(elseType);

        return { tag: "if", cases, elseBlock, type };
      }
      case "closure": {
        if (!forwardType) throw new Error("closure needs forward type");
        const resolved = new TypeChecker().resolve(forwardType);
        if (resolved.name !== this.funcTypes.use(expr.parameters.length)) {
          throw new Error("not a func");
        }
        const type = resolved as ValueType;

        const params = expr.parameters.map((binding, i) => ({
          type: type.matchTypes[i + 1],
          binding,
        }));
        const returnType = type.matchTypes[0];

        return {
          tag: "closure",
          type,
          ...this.checkFunc(params, returnType, expr.block),
        };
      }
      case "match": {
        const predicate = this.checkExpr(expr.expr, null);
        const checker = new TypeChecker();

        const resultType = TypeChecker.createVar("result");
        const cases: Map<string, CheckedMatchCase> = new Map();
        for (const matchCase of expr.cases) {
          const enumTag = matchCase.binding.value;
          if (cases.has(enumTag)) throw new Error("duplicate case");

          const ctor = this.typeConstructors.get(enumTag);
          checker.unify(ctor.type, predicate.type);

          const { block, type, bindings } = this.inScope(() => {
            const bindings = ctor.destructure(
              matchCase.binding.fields,
              predicate.type,
              (b, t) => this.initScopeBinding(b, t)
            );
            const { block, type } = this.checkBlock(matchCase.block);
            return { block, type, bindings };
          });
          checker.unify(type, resultType);
          cases.set(enumTag, { bindings, index: ctor.index, block });
        }

        const type = checker.resolve(resultType);

        return { tag: "match", expr: predicate, type, cases };
      }

      case "field": {
        const target = this.checkExpr(expr.expr, null);
        const { type, index } = this.structFields
          .get(target.type)
          .getField(expr.fieldName, target.type);
        return { tag: "field", type, index, expr: target };
      }
      case "call": {
        if (expr.expr.tag === "identifier" && expr.expr.value === "print") {
          return this.print(expr.args);
        }

        const callee = this.checkExpr(expr.expr, null);
        const checker = new TypeChecker();

        const calleeType = checker.checkValueType(
          callee.type,
          this.funcTypes.use(expr.args.length),
          "cannot call func"
        );

        const args = expr.args.map((arg, i) => {
          const forwardType = calleeType.matchTypes[i + 1];
          const checkedArg = this.checkExpr(arg, forwardType);
          checker.unify(forwardType, checkedArg.type);
          return checkedArg;
        });

        if (forwardType) {
          checker.unify(forwardType, calleeType.matchTypes[0]);
        }
        const returnType = checker.resolve(calleeType.matchTypes[0]);
        return { tag: "call", callee, args, type: returnType };
      }
      case "typeConstructor": {
        const ctor = this.typeConstructors.get(expr.value);
        return ctor.construct(expr.fields, (expr, type) =>
          this.checkExpr(expr, type)
        );
      }
      case "unaryOp": {
        const operand = this.checkExpr(expr.expr, null);
        switch (expr.operator) {
          case "-": {
            const checker = new TypeChecker();
            checker.unify(
              TypeChecker.createVar("Number", numTrait),
              operand.type
            );
            const type = checker.resolve(operand.type);

            return {
              tag: "callBuiltIn",
              opcode: Opcode.Neg,
              type,
              args: [operand],
            };
          }
          case "!": {
            new TypeChecker().unify(boolType, operand.type);

            return {
              tag: "callBuiltIn",
              opcode: Opcode.Not,
              type: boolType,
              args: [operand],
            };
          }
          // istanbul ignore next
          default:
            throw new Error("unknown operator");
        }
      }
      case "binaryOp": {
        const left = this.checkExpr(expr.left, null);
        const right = this.checkExpr(expr.right, null);
        switch (expr.operator) {
          case "+":
            return this.arithmeticOp(left, right, Opcode.Add);
          case "-":
            return this.arithmeticOp(left, right, Opcode.Sub);
          case "%":
            return this.arithmeticOp(left, right, Opcode.Mod);
          case ">":
            return this.comparisonOp(left, right, Opcode.Gt);
          case "==":
            return this.eqOp(left, right, Opcode.Eq);
          // istanbul ignore next
          default:
            throw new Error("unknown operator");
        }
      }
    }
  }
  private print(args: Expr[]): CheckedExpr {
    if (args.length !== 1) throw new Error();
    const checkedArg = this.checkExpr(args[0], null);
    const checker = new TypeChecker();
    checker.unify(
      checkedArg.type,
      TypeChecker.createVar("Printable", debugTrait)
    );
    const resolvedType = checker.resolve(checkedArg.type);

    switch (resolvedType.name) {
      case stringType.name:
        return {
          tag: "callBuiltIn",
          opcode: Opcode.PrintStr,
          args: [checkedArg],
          type: voidType,
        };
      case intType.name:
      case floatType.name:
        return {
          tag: "callBuiltIn",
          opcode: Opcode.PrintNum,
          args: [checkedArg],
          type: voidType,
        };
      // istanbul ignore next
      default:
        throw new Error("cannot print");
    }
  }

  private arithmeticOp(
    left: CheckedExpr,
    right: CheckedExpr,
    opcode: Opcode
  ): CheckedExpr {
    const checker = new TypeChecker();
    const t = TypeChecker.createVar("Number", numTrait);
    checker.unify(t, left.type);
    checker.unify(t, right.type);
    const type = checker.resolve(t);
    return {
      tag: "callBuiltIn",
      opcode,
      type,
      args: [left, right],
    };
  }
  private comparisonOp(
    left: CheckedExpr,
    right: CheckedExpr,
    opcode: Opcode
  ): CheckedExpr {
    const checker = new TypeChecker();
    const t = TypeChecker.createVar("Number", numTrait);
    checker.unify(t, left.type);
    checker.unify(t, right.type);
    return {
      tag: "callBuiltIn",
      opcode,
      type: boolType,
      args: [left, right],
    };
  }
  private eqOp(
    left: CheckedExpr,
    right: CheckedExpr,
    opcode: Opcode
  ): CheckedExpr {
    const checker = new TypeChecker();
    const t = TypeChecker.createVar("Equatable", eqTrait);
    checker.unify(t, left.type);
    checker.unify(t, right.type);

    return {
      tag: "callBuiltIn",
      opcode,
      type: boolType,
      args: [left, right],
    };
  }
  private initType(name: string, fn: () => Type) {
    const resolvedType = new TypeChecker().createRec([], (recurType) => {
      this.types.init(name, recurType);
      return fn();
    });
    this.types.set(name, resolvedType);
  }
  private withTypeParams<T>(
    typeParams: TypeParam[],
    fn: (checkedParams: Type[]) => T
  ): T {
    return this.inScope(() => {
      const types = typeParams.map((typeParam) => {
        const type = TypeChecker.createVar(typeParam.value);
        this.types.init(typeParam.value, type);
        return type;
      });
      return fn(types);
    });
  }
  private initScopeBinding(binding: Binding, type: Type): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        if (!binding.value.startsWith("_")) {
          this.vars.init(binding.value, type);
        }
        return binding;
      case "struct": {
        const fields = this.structFields
          .get(type)
          .destructure(binding.fields, type, (binding, type) =>
            this.initScopeBinding(binding, type)
          );
        return { tag: "struct", fields };
      }
    }
  }
  private checkTypeExpr(typeExpr: TypeExpr): Type {
    switch (typeExpr.tag) {
      case "identifier": {
        const checker = new TypeChecker();
        const abstractType = this.types.get(typeExpr.value);

        const concreteType = { ...abstractType };
        for (const [i, arg] of typeExpr.typeArgs.entries()) {
          const argType = this.checkTypeExpr(arg);
          if (concreteType.tag === "value") {
            checker.unify(argType, concreteType.matchTypes[i]);
            concreteType.matchTypes[i] = argType;
          }
        }
        return concreteType;
      }
      case "func":
        return this.funcType(
          typeExpr.typeParameters,
          typeExpr.parameters,
          typeExpr.returnType
        );
      case "tuple":
        return this.structFields.initTuple(
          typeExpr.typeArgs.map((arg) => this.checkTypeExpr(arg))
        );
    }
  }
  private inScope<T>(fn: () => T): T {
    this.vars = this.vars.push();
    this.types = this.types.push();
    this.typeConstructors = this.typeConstructors.push();
    try {
      return fn();
    } finally {
      this.typeConstructors = this.typeConstructors.pop();
      this.types = this.types.pop();
      this.vars = this.vars.pop();
    }
  }
  private funcType(
    typeParameters: TypeParam[],
    parameters: TypeExpr[],
    returnType: TypeExpr
  ) {
    const matchTypes = this.inScope(() => {
      for (const typeParam of typeParameters) {
        this.types.init(
          typeParam.value,
          TypeChecker.createVar(typeParam.value)
        );
      }
      const checkedParams = parameters.map((type) => this.checkTypeExpr(type));
      const checkedReturnType = this.checkTypeExpr(returnType);
      return [checkedReturnType, ...checkedParams];
    });

    return TypeChecker.createValue(
      this.funcTypes.use(parameters.length),
      matchTypes,
      []
    );
  }
  private checkFunc(
    parameters: Array<{ binding: Binding; type: Type }>,
    returnType: Type,
    rawBlock: Stmt[]
  ): FuncFields<Type> {
    return this.inScope(() => {
      const outerScope = this.vars.pop();
      return this.currentFunc.withFunc(returnType, outerScope, () => {
        // add parameters to scope
        const checkedParams = parameters.map((param) => ({
          type: param.type,
          binding: this.initScopeBinding(param.binding, param.type),
        }));

        // check function body
        const { block } = this.checkBlock(rawBlock);
        const checker = new TypeChecker();

        // handle implicit returns
        const lastStmt = block.pop() ?? { tag: "noop" };
        switch (lastStmt.tag) {
          case "return":
            block.push(lastStmt);
            break;
          case "expr":
            checker.unify(returnType, lastStmt.expr.type);
            block.push({ tag: "return", expr: lastStmt.expr });
            break;
          case "noop":
            checker.unify(returnType, voidType);
            block.push({ tag: "return", expr: null });
            break;
          default:
            checker.unify(returnType, voidType);
            block.push(lastStmt);
            block.push({ tag: "return", expr: null });
            break;
        }

        return { parameters: checkedParams, block };
      });
    });
  }
}
