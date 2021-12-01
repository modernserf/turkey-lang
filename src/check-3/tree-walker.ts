import { Expr, Stmt, TypeExpr } from "../types";
import { noMatch } from "../utils";
import {
  TreeWalker as ITreeWalker,
  CheckedExpr,
  ExprAttrs,
  BlockScope,
  CheckedStmt,
  voidType,
  intType,
  floatType,
  stringType,
  Checker,
  boolType,
  Func,
  createVar,
  Trait,
  Traits,
  funcType,
} from "./types";

export class TreeWalker implements ITreeWalker {
  public scope!: BlockScope;
  public checker!: Checker;
  public func!: Func;
  public traits!: Traits;
  program(stmt: Stmt[]): CheckedStmt[] {
    return this.block(stmt).block;
  }
  expr(expr: Expr, context: ExprAttrs | null): CheckedExpr {
    switch (expr.tag) {
      case "identifier": {
        const { name, attrs } = this.scope.getValue(expr.value);
        return { tag: "ident", value: name, attrs };
      }
      case "integer":
        return {
          tag: "primitive",
          value: expr.value,
          attrs: { type: intType },
        };
      case "float":
        return {
          tag: "primitive",
          value: expr.value,
          attrs: { type: floatType },
        };
      case "string":
        return {
          tag: "string",
          value: expr.value,
          attrs: { type: stringType },
        };
      case "tuple":
      case "list":
      case "typeConstructor":
      case "closure":
      case "call":
      case "field":
      case "unaryOp":
      case "binaryOp":
        throw new Error("todo");
      case "do": {
        const { block, attrs } = this.block(expr.block);
        return { tag: "do", block, attrs };
      }
      case "if":
      case "match":
        throw new Error("todo");

      default:
        noMatch(expr);
    }
  }
  block(inBlock: Stmt[]): { block: CheckedStmt[]; attrs: ExprAttrs } {
    return this.scope.inScope(() => {
      const block = inBlock.flatMap((stmt) => this.stmt(stmt));
      const lastItem = block[block.length - 1];
      if (lastItem && lastItem.tag === "expr") {
        return { block, attrs: lastItem.attrs };
      } else {
        return { block, attrs: { type: voidType } };
      }
    });
  }
  typeExpr(typeExpr: TypeExpr, typeParams?: Map<string, ExprAttrs>): ExprAttrs {
    switch (typeExpr.tag) {
      case "identifier": {
        if (typeExpr.typeArgs.length) throw new Error("todo");
        if (typeParams) {
          const found = typeParams.get(typeExpr.value);
          if (found) return found;
        }
        return this.scope.getType(typeExpr.value).attrs;
      }
      case "tuple":
      case "func":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(typeExpr);
    }
  }
  private stmt(stmt: Stmt): CheckedStmt[] {
    switch (stmt.tag) {
      case "expr": {
        const expr = this.expr(stmt.expr, null);
        return [{ tag: "expr", expr, attrs: expr.attrs }];
      }
      case "type":
      case "struct":
      case "enum":
      case "trait":
      case "impl":
        throw new Error("todo");
      case "let": {
        const ctx = stmt.type ? this.typeExpr(stmt.type) : null;
        const expr = this.expr(stmt.expr, ctx);
        if (ctx) {
          this.checker.checkType(ctx.type, expr.attrs.type);
        }
        const bindings = this.scope.initValue(stmt.binding, expr.attrs);
        return [
          { tag: "let", binding: bindings.root, expr },
          ...bindings.rest.map(({ name, expr }) => ({
            tag: "let" as const,
            binding: name,
            expr,
          })),
        ];
      }
      case "func": {
        const varMap = new Map<string, ExprAttrs>();
        const traitParams = new Map<symbol, Trait[]>();
        stmt.typeParameters.forEach((p) => {
          const typeVar = createVar(Symbol(p.value));
          if (p.traits) {
            traitParams.set(
              typeVar.name,
              p.traits.map((t) => this.traits.getTrait(t))
            );
          }
          varMap.set(p.value, { type: typeVar });
        });

        const parameters = stmt.parameters.map((p) => {
          const binding = p.binding;
          const attrs = this.typeExpr(p.type, varMap);
          return { binding, attrs };
        });

        const returns = this.typeExpr(stmt.returnType, varMap);
        const type = funcType(
          returns.type,
          parameters.map((p) => p.attrs.type)
        );
        const { root } = this.scope.initValue(
          { tag: "identifier", value: stmt.name },
          {
            type,
            traitParams,
          }
        );

        const expr = this.func.create(
          traitParams,
          parameters,
          returns,
          stmt.block
        );

        return [{ tag: "let", binding: root, expr }];
      }
      case "return": {
        const expr = this.func.return(stmt.expr);
        return [{ tag: "return", expr }];
      }
      case "while": {
        const expr = this.expr(stmt.expr, null);
        this.checker.checkType(boolType, expr.attrs.type);
        const { block } = this.block(stmt.block);
        return [{ tag: "while", expr, block }];
      }
      case "for":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
}
