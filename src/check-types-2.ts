import { CurrentFuncState } from "./current-func";
import { Scope } from "./scope";
import { Trait, Type, TypeChecker, ValueType } from "./type-scope-3";
import { Binding, Expr, Opcode, Stmt, TypeExpr } from "./types";
import { noMatch } from "./utils";

export type CheckedExpr =
  | { tag: "primitive"; value: number; type: Type }
  | { tag: "string"; value: string; type: Type }
  | { tag: "enum"; index: number; fields: CheckedExpr[]; type: Type }
  | { tag: "struct"; value: CheckedExpr[]; type: Type }
  | { tag: "identifier"; value: string; type: Type }
  | {
      tag: "closure";
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: Type;
    }
  | { tag: "field"; expr: CheckedExpr; index: number; type: Type }
  | { tag: "callBuiltIn"; opcode: Opcode; args: CheckedExpr[]; type: Type }
  | { tag: "call"; callee: CheckedExpr; args: CheckedExpr[]; type: Type }
  | { tag: "do"; block: CheckedStmt[]; type: Type }
  | {
      tag: "if";
      cases: Array<{ predicate: CheckedExpr; block: CheckedStmt[] }>;
      elseBlock: CheckedStmt[];
      type: Type;
    }
  | {
      tag: "match";
      expr: CheckedExpr;
      cases: Map<
        string,
        {
          index: number;
          bindings: CheckedStructFieldBinding[];
          block: CheckedStmt[];
        }
      >;
      type: Type;
    };

export type CheckedStmt =
  | { tag: "let"; binding: CheckedBinding; expr: CheckedExpr }
  | { tag: "return"; expr: CheckedExpr | null }
  | {
      tag: "func";
      name: string;
      parameters: CheckedParam[];
      upvalues: CheckedUpvalue[];
      block: CheckedStmt[];
      type: Type;
    }
  | { tag: "while"; expr: CheckedExpr; block: CheckedStmt[] }
  | { tag: "expr"; expr: CheckedExpr; hasValue: boolean };

export type CheckedBinding =
  | { tag: "identifier"; value: string }
  | { tag: "struct"; fields: CheckedStructFieldBinding[] };

export type CheckedStructFieldBinding = {
  fieldIndex: number;
  binding: CheckedBinding;
};

export type CheckedParam = { binding: CheckedBinding; type: Type };
export type CheckedUpvalue = { name: string; type: Type };

const primitive = (name: string, ...traits: Trait[]) =>
  TypeChecker.createValue(Symbol(name), [], [], traits);

const numTrait = TypeChecker.createTrait(Symbol("Num"), []);
const debugTrait = TypeChecker.createTrait(Symbol("Debug"), []);

const voidType = primitive("Void");
const intType = primitive("Int", numTrait, debugTrait);
const floatType = primitive("Float", numTrait, debugTrait);
const stringType = primitive("String", debugTrait);
const boolType = primitive("Bool");

type TypeConstructor =
  | { tag: "struct"; type: ValueType }
  | { tag: "enum"; type: ValueType; value: number };

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

export class Thing {
  private vars: Scope<string, Type>;
  private types: Scope<string, Type>;
  private typeConstructors: Scope<string, TypeConstructor>;
  private currentFunc = new CurrentFuncState<Type>();
  private checker: TypeChecker;
  private funcTypes = new ArityName();
  private tupleTypes = new ArityName();
  private structFields: Scope<symbol, Scope<string, FieldInfo>> = new Scope();
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
      .init("False", { tag: "enum", type: boolType, value: 0 })
      .init("True", {
        tag: "enum",
        type: boolType,
        value: 1,
      });
  }
  private checkStmt(stmt: Stmt): CheckedStmt | null {
    switch (stmt.tag) {
      case "type":
      case "struct":
      case "enum":
        throw new Error("todo type defs");
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
      case "func":
      case "while":
        throw new Error("todo: blocks");

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
        return { tag: "struct", type, value: fields };
      }
      case "closure":
      case "do":
      case "if":
      case "match":
        throw new Error("TODO: blocks");
      case "field": {
        const target = this.checkExpr(expr.expr, null);
        // TODO: handle field info in type-scope?
        const fieldInfo = this.getFieldInfo(target.type, expr.fieldName);
        const type = this.checker.getField(
          target.type,
          target.type.name,
          fieldInfo.typeIndex,
          forwardType || TypeChecker.createVar(Symbol(), []),
          "cannot get field"
        );
        return {
          tag: "field",
          type,
          index: fieldInfo.compileIndex,
          expr: target,
        };
      }
      case "call": {
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
      case "typeConstructor":
        throw new Error("type constructors");
      case "unaryOp":
      case "binaryOp":
        throw new Error("todo: operators");
    }
  }
  private getFieldInfo(type: Type, fieldName: string) {
    return this.structFields.get(type.name).get(fieldName);
  }
  private initScopeBinding(binding: Binding, type: Type): CheckedBinding {
    switch (binding.tag) {
      case "identifier":
        this.vars.init(binding.value, type);
        return binding;
      case "struct":
        throw new Error("not yet implemented");
    }
  }
  private checkTypeExpr(type: TypeExpr): Type {
    switch (type.tag) {
      case "identifier":
        return this.types.get(type.value);
      case "tuple":
      case "func":
        throw new Error("not yet implemented");
    }
  }
}
