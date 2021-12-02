import { IRStmt } from "../compiler-2/types";
import { Expr, Stmt, TypeExpr } from "../types";
import { noMatch } from "../utils";
import { CheckerCtx } from "./checker";
import {
  TreeWalker as ITreeWalker,
  CheckedExpr,
  BlockScope,
  CheckedStmt,
  voidType,
  intType,
  floatType,
  stringType,
  boolType,
  Func,
  createVar,
  Traits,
  funcType,
  Type,
  Stdlib,
} from "./types";

export class TreeWalker implements ITreeWalker {
  public scope!: BlockScope;
  public func!: Func;
  public traits!: Traits;
  program(stdlib: Stdlib, program: Stmt[]): IRStmt[] {
    const prelude: IRStmt[] = Array.from(stdlib.values).map(([name, expr]) => {
      const binding = this.scope.initValue(
        { tag: "identifier", value: name },
        expr.type
      );

      return { tag: "let", binding: binding.root, expr };
    });

    return [...prelude, ...this.block(program).block];
  }
  expr(expr: Expr, context: Type | null): CheckedExpr {
    switch (expr.tag) {
      case "identifier": {
        const { name, type } = this.scope.getValue(expr.value);
        return { tag: "ident", value: name, type };
      }
      case "integer":
        return {
          tag: "primitive",
          value: expr.value,
          type: intType,
        };
      case "float":
        return {
          tag: "primitive",
          value: expr.value,
          type: floatType,
        };
      case "string":
        return {
          tag: "string",
          value: expr.value,
          type: stringType,
        };
      case "tuple":
      case "list":
      case "typeConstructor":
      case "closure":
        throw new Error("todo");
      case "call":
        return this.func.call(expr.expr, expr.args);
      case "field":
      case "unaryOp":
      case "binaryOp":
        throw new Error("todo");
      case "do": {
        const { block, type } = this.block(expr.block);
        return { tag: "do", block, type };
      }
      case "if":
      case "match":
        throw new Error("todo");

      default:
        noMatch(expr);
    }
  }
  block(inBlock: Stmt[]): { block: CheckedStmt[]; type: Type } {
    return this.scope.inScope(() => {
      const block = inBlock.flatMap((stmt) => this.stmt(stmt));
      const lastItem = block[block.length - 1];
      if (lastItem && lastItem.tag === "expr") {
        return { block, type: lastItem.type };
      } else {
        return { block, type: voidType };
      }
    });
  }
  typeExpr(typeExpr: TypeExpr, typeParams?: Map<string, Type>): Type {
    switch (typeExpr.tag) {
      case "identifier": {
        if (typeExpr.typeArgs.length) throw new Error("todo");
        if (typeParams) {
          const found = typeParams.get(typeExpr.value);
          if (found) return found;
        }
        return this.scope.getType(typeExpr.value).type;
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
        return [{ tag: "expr", expr, type: expr.type }];
      }
      case "type":
      case "struct":
      case "enum":
      case "trait":
      case "impl":
        throw new Error("todo");
      case "let": {
        const type = stmt.type ? this.typeExpr(stmt.type) : null;
        const expr = this.expr(stmt.expr, type);
        if (type) {
          new CheckerCtx(this.traits).unify(type, expr.type);
        }
        const bindings = this.scope.initValue(stmt.binding, expr.type);
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
        // for each type param:
        // - create a new abstract type
        // - look up associated traits
        const typeParams = stmt.typeParameters.map((p) => {
          const traits = p.traits.map((t) => this.traits.getTrait(t));
          const type = createVar(Symbol(p.value), traits);
          return { name: p.value, type, traits };
        });
        // map of type param name -> type used when checking param & return types
        const varMap = new Map(
          typeParams.map(({ name, type }) => [name, type])
        );
        // hidden trait impl params, flattened out from type params
        // func foo <T: Foo + Bar, U, V: Baz> => [Foo, Bar, Baz]
        const traitParams = typeParams.flatMap(({ type, traits }) => {
          return traits.map((trait) => ({ type, trait }));
        });

        const parameters = stmt.parameters.map((p) => {
          const binding = p.binding;
          const type = this.typeExpr(p.type, varMap);
          return { binding, type };
        });

        const returns = this.typeExpr(stmt.returnType, varMap);
        const type = funcType(
          returns,
          parameters.map((p) => p.type),
          traitParams
        );
        const { root } = this.scope.initValue(
          { tag: "identifier", value: stmt.name },
          type
        );

        const expr = this.func.create(
          stmt.name,
          typeParams,
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
        new CheckerCtx(this.traits).unify(boolType, expr.type);
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
