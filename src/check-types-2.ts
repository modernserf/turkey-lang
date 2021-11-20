import { CurrentFuncState, FuncFields } from "./current-func";
import { Scope } from "./scope";
import { TypeChecker } from "./type-scope-3";
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
} from "./types";
import { noMatch } from "./utils";

const primitive = (name: string, ...traits: Trait[]) =>
  TypeChecker.createValue(Symbol(name), [], [], traits);

const numTrait = TypeChecker.createTrait(Symbol("Num"), []);
const debugTrait = TypeChecker.createTrait(Symbol("Debug"), []);
const eqTrait = TypeChecker.createTrait(Symbol("Eq"), []);

const voidType = primitive("Void");
const intType = primitive("Int", numTrait, debugTrait, eqTrait);
const floatType = primitive("Float", numTrait, debugTrait, eqTrait);
const stringType = primitive("String", debugTrait, eqTrait);
const boolType = primitive("Bool", eqTrait);

type TypeConstructor =
  | { tag: "struct"; type: ValueType }
  | { tag: "enum"; type: ValueType; index: number };

class ArityName {
  private map: Map<number, symbol> = new Map();
  use(num: number): symbol {
    const res = this.map.get(num);
    if (res) return res;
    const sym = Symbol(num);
    this.map.set(num, sym);
    return sym;
  }
}

type FieldInfo = {
  typeIndex: number;
  compileIndex: number;
};

export function check(program: Stmt[]): CheckedStmt[] {
  return Thing.checkProgram(program);
}

export class Thing {
  private vars: Scope<string, Type>;
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, TypeConstructor>;
  private currentFunc = new CurrentFuncState<Type>();
  private checker: TypeChecker;
  private funcTypes = new ArityName();
  private tupleTypes = new ArityName();
  private structFields: Scope<symbol, Scope<string, FieldInfo>> = new Scope();
  static checkProgram(program: Stmt[]): CheckedStmt[] {
    return new Thing().checkBlock(program).block;
  }
  constructor() {
    this.vars = new Scope();
    this.types = new Scope();
    this.typeConstructors = new Scope();
    this.checker = new TypeChecker();
    this.types
      .init("Void", voidType)
      .init("Int", intType)
      .init("Float", floatType)
      .init("String", stringType)
      .init("Bool", boolType);
    this.typeConstructors
      .init("False", { tag: "enum", type: boolType, index: 0 })
      .init("True", {
        tag: "enum",
        type: boolType,
        index: 1,
      });
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
        if (stmt.binding.typeParameters.length) {
          throw new Error("todo: type params");
        }
        const resolvedType = this.checker.createRec([], (type) => {
          this.types.init(stmt.binding.value, type);
          return this.checkTypeExpr(stmt.type);
        });
        this.types.set(stmt.binding.value, resolvedType);
        return null;
      }
      case "enum": {
        if (stmt.binding.typeParameters.length) {
          throw new Error("todo: type params");
        }
        const type = TypeChecker.createValue(
          Symbol(stmt.binding.value),
          [],
          [],
          [eqTrait]
        );
        this.types.init(stmt.binding.value, type);
        for (const [i, enumCase] of stmt.cases.entries()) {
          this.typeConstructors.init(enumCase.tagName, {
            tag: "enum",
            type,
            index: i,
          });
        }
        return null;
      }
      case "struct": {
        if (stmt.binding.typeParameters.length) {
          throw new Error("todo: type params");
        }
        const fields = stmt.fields.map((field) => ({
          fieldName: field.fieldName,
          type: this.checkTypeExpr(field.type),
        }));
        const type = TypeChecker.createValue(
          Symbol(stmt.binding.value),
          [],
          fields.map((field) => field.type),
          []
        );
        this.types.init(stmt.binding.value, type);
        const fieldsMap = new Scope<string, FieldInfo>();
        for (const [i, field] of fields.entries()) {
          fieldsMap.init(field.fieldName, { typeIndex: i, compileIndex: i });
        }
        this.structFields.init(type.name, fieldsMap);
        this.typeConstructors.init(stmt.binding.value, {
          tag: "struct",
          type,
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
        const expr = this.checker.inScope(() => {
          const forwardType = stmt.type ? this.checkTypeExpr(stmt.type) : null;
          const expr = this.checkExpr(stmt.expr, forwardType);
          if (forwardType) {
            this.checker.unify(expr.type, forwardType);
          }
          expr.type = this.checker.resolve(expr.type);
          return expr;
        });
        const binding = this.initScopeBinding(stmt.binding, expr.type);
        return { tag: "let", binding, expr };
      }
      case "return": {
        const returnType = this.currentFunc.funcReturnType();
        return this.checker.inScope(() => {
          if (!stmt.expr) {
            this.checker.unify(voidType, returnType);
            return { tag: "return", expr: null };
          }
          const expr = this.checkExpr(stmt.expr, returnType);
          this.checker.unify(returnType, expr.type);
          return { tag: "return", expr };
        });
      }
      case "while": {
        const predicate = this.checkExpr(stmt.expr, null);
        this.checker.inScope(() => {
          this.checker.unify(predicate.type, boolType);
        });
        const { block } = this.checkBlock(stmt.block);
        return { tag: "while", expr: predicate, block };
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
        const typeName = this.tupleTypes.use(expr.fields.length);
        const placeholderFields = expr.fields.map(() =>
          TypeChecker.createVar(Symbol(), [])
        );
        const forwardFields = forwardType
          ? this.checker.getAllMatchTypes(
              forwardType,
              typeName,
              placeholderFields,
              "could not construct tuple"
            )
          : placeholderFields;

        const fields = expr.fields.map((field, i) =>
          this.checkExpr(field.expr, forwardFields[i])
        );

        const type = TypeChecker.createValue(
          typeName,
          fields.map((field) => field.type),
          [],
          []
        );
        return { tag: "struct", type, fields: fields };
      }
      case "do": {
        const { block, type } = this.checkBlock(expr.block);
        return { tag: "do", block, type };
      }
      case "if": {
        const cases = expr.cases.map((ifCase) => {
          const predicate = this.checkExpr(ifCase.predicate, null);
          this.checker.inScope(() => {
            this.checker.unify(boolType, predicate.type);
          });
          const { block, type } = this.checkBlock(ifCase.block);
          return { predicate, block, type };
        });
        const { block: elseBlock, type: elseType } = this.checkBlock(
          expr.elseBlock
        );
        const type = this.checker.inScope(() => {
          for (const { type: caseType } of cases) {
            this.checker.unify(caseType, elseType);
          }
          return this.checker.resolve(elseType);
        });

        return { tag: "if", cases, elseBlock, type };
      }
      case "closure": {
        if (!forwardType) throw new Error("closure needs forward type");
        const type = this.checker.inScope(() => {
          const resolved = this.checker.resolve(forwardType);
          if (resolved.name !== this.funcTypes.use(expr.parameters.length)) {
            throw new Error("not a func");
          }
          return resolved as ValueType;
        });

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
      case "match":
        throw new Error("TODO: enums");
      case "field": {
        const target = this.checkExpr(expr.expr, null);
        const { type, index } = this.checkField(
          target.type,
          expr.fieldName,
          forwardType
        );
        return { tag: "field", type, index, expr: target };
      }
      case "call": {
        if (expr.expr.tag === "identifier" && expr.expr.value === "print") {
          if (expr.args.length !== 1) throw new Error();
          const checkedArg = this.checkExpr(expr.args[0], null);
          const resolvedType = this.checker.inScope(() => {
            this.checker.unify(
              checkedArg.type,
              TypeChecker.createVar(Symbol(), [debugTrait])
            );
            return this.checker.resolve(checkedArg.type);
          });
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
            default:
              throw new Error("cannot print");
          }
        }

        // TODO: handle built-in functions
        const callee = this.checkExpr(expr.expr, null);
        return this.checker.inScope(() => {
          const calleeType = this.checker.checkValueType(
            callee.type,
            this.funcTypes.use(expr.args.length),
            "cannot call func"
          );
          const args = expr.args.map((arg, i) => {
            const forwardType = calleeType.matchTypes[i + 1];
            const checkedArg = this.checkExpr(arg, forwardType);
            this.checker.unify(forwardType, checkedArg.type);
            return checkedArg;
          });
          if (forwardType) {
            this.checker.unify(forwardType, calleeType.matchTypes[0]);
          }
          const returnType = this.checker.resolve(calleeType.matchTypes[0]);

          return { tag: "call", callee, args, type: returnType };
        });
      }
      case "typeConstructor": {
        const constructor = this.typeConstructors.get(expr.value);
        switch (constructor.tag) {
          case "enum":
            if (expr.fields.length) throw new Error("todo fields");
            return { ...constructor, fields: [] };
          case "struct":
            return this.checker.inScope(() => {
              const fieldsMap = this.structFields.get(constructor.type.name);
              const fields: CheckedExpr[] = Array(
                constructor.type.allTypes.length
              ).fill(undefined);
              for (const field of expr.fields) {
                const info = fieldsMap.get(field.fieldName);
                const expectedType = constructor.type.allTypes[info.typeIndex];
                const fieldExpr = this.checkExpr(field.expr, expectedType);
                this.checker.unify(fieldExpr.type, expectedType);
                fieldExpr.type = this.checker.resolve(fieldExpr.type);
                if (fields[info.compileIndex]) {
                  throw new Error("duplicate field");
                }
                fields[info.compileIndex] = fieldExpr;
              }
              if (fields.some((f) => !f)) {
                throw new Error("missing field");
              }
              return { ...constructor, fields };
            });

          // istanbul ignore next
          default:
            return noMatch(constructor);
        }
      }
      case "unaryOp": {
        const operand = this.checkExpr(expr.expr, null);
        switch (expr.operator) {
          case "-": {
            const type = this.checker.inScope(() => {
              this.checker.unify(
                TypeChecker.createVar(Symbol(), [numTrait]),
                operand.type
              );
              return this.checker.resolve(operand.type);
            });
            return {
              tag: "callBuiltIn",
              opcode: Opcode.Neg,
              type,
              args: [operand],
            };
          }
          case "!": {
            this.checker.inScope(() => {
              this.checker.unify(boolType, operand.type);
            });
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
  private arithmeticOp(
    left: CheckedExpr,
    right: CheckedExpr,
    opcode: Opcode
  ): CheckedExpr {
    const type = this.checker.inScope(() => {
      const t = TypeChecker.createVar(Symbol(), [numTrait]);
      this.checker.unify(t, left.type);
      this.checker.unify(t, right.type);
      return this.checker.resolve(t);
    });
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
    this.checker.inScope(() => {
      const t = TypeChecker.createVar(Symbol(), [numTrait]);
      this.checker.unify(t, left.type);
      this.checker.unify(t, right.type);
    });
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
    this.checker.inScope(() => {
      const t = TypeChecker.createVar(Symbol(), [eqTrait]);
      this.checker.unify(t, left.type);
      this.checker.unify(t, right.type);
    });
    return {
      tag: "callBuiltIn",
      opcode,
      type: boolType,
      args: [left, right],
    };
  }
  private getFieldInfo(type: Type, fieldName: string) {
    return this.structFields.get(type.name).get(fieldName);
  }
  private initScopeBinding(binding: Binding, type: Type): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.vars.init(binding.value, type);
        return binding;
      case "struct": {
        const fields = binding.fields.map((bindingField) => {
          // TODO: is there a reasonable forwardType for this?
          const typeField = this.checkField(type, bindingField.fieldName, null);
          const checkedField = this.initScopeBinding(
            bindingField.binding,
            typeField.type
          );
          return { fieldIndex: typeField.index, binding: checkedField };
        });
        return { tag: "struct", fields };
      }
    }
  }
  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.tag) {
      case "identifier":
        return this.types.get(type.value);
      case "func":
        return this.funcType(
          type.typeParameters,
          type.parameters,
          type.returnType
        );

      case "tuple":
        throw new Error("not yet implemented");
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
          TypeChecker.createVar(Symbol(typeParam.value), [])
        );
      }
      const checkedParams = parameters.map((type) => this.checkTypeExpr(type));
      const checkedReturnType = this.checkTypeExpr(returnType);
      return [checkedReturnType, ...checkedParams];
    });

    return TypeChecker.createValue(
      this.funcTypes.use(parameters.length),
      matchTypes,
      [],
      []
    );
  }
  private checkField(
    targetType: Type,
    fieldName: string,
    forwardType: Type | null
  ) {
    const fieldInfo = this.getFieldInfo(targetType, fieldName);
    const type = this.checker.getField(
      targetType,
      targetType.name,
      fieldInfo.typeIndex,
      forwardType || TypeChecker.createVar(Symbol(), []),
      "cannot get field"
    );
    return { type, index: fieldInfo.compileIndex };
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

        return this.checker.inScope(() => {
          // handle implicit returns
          const lastStmt = block.pop() ?? { tag: "noop" };
          switch (lastStmt.tag) {
            case "return":
              block.push(lastStmt);
              break;
            case "expr":
              this.checker.unify(returnType, lastStmt.expr.type);
              block.push({ tag: "return", expr: lastStmt.expr });
              break;
            case "noop":
              this.checker.unify(returnType, voidType);
              block.push({ tag: "return", expr: null });
              break;
            default:
              this.checker.unify(returnType, voidType);
              block.push(lastStmt);
              block.push({ tag: "return", expr: null });
              break;
          }

          return { parameters: checkedParams, block };
        });
      });
    });
  }
}
