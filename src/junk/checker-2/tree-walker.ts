import { noMatch } from "../../utils";
import { Stmt, Expr, TypeExpr } from "../../types";
import { BlockScope } from "./block-scope";
import { Func } from "./func";
import { Traits } from "./traits";
import {
  TypedStmt,
  TypedBlock,
  TypedExpr,
  TypeVarMap,
  Type,
  voidType,
  intType,
  stringType,
  floatType,
  StdLib,
} from "./types";

export class TreeWalker {
  private scope: BlockScope;
  private func: Func;
  private traits: Traits;
  constructor(stdlib: StdLib) {
    this.scope = new BlockScope(stdlib);
    this.traits = new Traits(stdlib);
    this.func = new Func(this.scope, this.traits);
  }
  public program(program: Stmt[]): TypedStmt[] {
    return this.block(program).block;
  }
  private block(inBlock: Stmt[]): TypedBlock {
    return this.scope.inScope(() => {
      const block = inBlock.flatMap((stmt) => this.stmt(stmt));
      const lastStmt = block[block.length - 1];
      if (lastStmt?.tag === "expr") {
        return { block, result: lastStmt.expr };
      } else {
        return { block, result: { type: voidType } };
      }
    });
  }
  private expr(expr: Expr): TypedExpr {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, type: intType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
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
      case "do": {
        const { block, result } = this.block(expr.block);
        return { tag: "do", block, ...result };
      }
      case "if":
      case "match":
      case "unaryOp":
      case "binaryOp":
      case "typeConstructor":
      case "list":
      case "tuple":
      case "field":
      case "closure":
        throw new Error("todo");

      default:
        noMatch(expr);
    }
  }
  private typeExpr(type: TypeExpr, vars: TypeVarMap): Type {
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
      case "func": {
        const expr = this.func.define(
          (attrs) => this.scope.initValue(stmt.name, attrs),
          stmt.typeParameters,
          (vars) =>
            stmt.parameters.map((param) => ({
              binding: param.binding,
              type: this.typeExpr(param.type, vars),
            })),
          (vars) => this.typeExpr(stmt.returnType, vars),
          () => this.block(stmt.block)
        );
        return [{ tag: "let", expr, name: stmt.name }];
      }
      case "expr": {
        const expr = this.expr(stmt.expr);
        return [{ tag: "expr", expr, type: expr.type }];
      }
      case "for":
      case "while":
      case "type":
      case "trait":
      case "impl":
      case "enum":
      case "struct":
      case "return":
        throw new Error("todo");
      default:
        noMatch(stmt);
    }
  }
}
