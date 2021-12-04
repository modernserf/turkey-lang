import { Builtin, IRStmt } from "../ir";
import { Expr, Stmt, TypeExpr } from "../ast";
import { noMatch } from "../utils";
import { CheckerCtx } from "./checker";
import {
  TreeWalker as ITreeWalker,
  Obj,
  CheckedExpr,
  Scope,
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
  tupleType,
  vecType,
} from "./types";

export class TreeWalker implements ITreeWalker {
  public scope!: Scope;
  public func!: Func;
  public traits!: Traits;
  public obj!: Obj;
  private unaryOps!: Map<string, { op: Builtin; type: Type }>;
  private binaryOps!: Map<string, { op: Builtin; type: Type }>;
  program(stdlib: Stdlib, program: Stmt[]): IRStmt[] {
    const prelude: IRStmt[] = Array.from(stdlib.values).map(([name, expr]) => {
      const binding = this.scope.initValue(
        { tag: "identifier", value: name },
        expr.type
      );

      return { tag: "let", binding: binding.root, expr };
    });

    this.unaryOps = stdlib.unaryOps;
    this.binaryOps = stdlib.binaryOps;

    return [...prelude, ...this.block(program).block];
  }
  expr(expr: Expr, context: Type | null): CheckedExpr {
    switch (expr.tag) {
      case "identifier":
        return this.scope.getValue(expr.value);
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
      case "tuple": {
        return this.obj.tuple(
          {
            tag: "struct",
            type: tupleType(
              expr.items.map((_, i) => createVar(Symbol(`T${i}`), []))
            ),
          },
          expr.items,
          context
        );
      }
      case "list": {
        return this.obj.list(
          { tag: "struct", type: vecType(createVar(Symbol("T"), [])) },
          expr.items,
          context
        );
      }
      case "typeLiteral": {
        const ctor = this.scope.getConstructor(expr.value);
        return this.obj.tuple(ctor, [], context);
      }
      case "typeRecord": {
        const ctor = this.scope.getConstructor(expr.value);
        return this.obj.record(ctor, expr.fields, context);
      }
      case "typeTuple": {
        const ctor = this.scope.getConstructor(expr.value);
        return this.obj.tuple(ctor, expr.items, context);
      }
      case "typeList": {
        const ctor = this.scope.getConstructor(expr.value);
        return this.obj.list(ctor, expr.items, context);
      }
      case "typeSizedList": {
        const ctor = this.scope.getConstructor(expr.value);
        return this.obj.sizedList(ctor, expr.expr, expr.size, context);
      }
      case "closure":
        if (!context) {
          throw new Error("insufficient type info for closure");
        }
        return this.func.createClosure(expr.parameters, expr.block, context);
      case "call":
        return this.func.call(expr.expr, expr.args);
      case "field":
        return this.obj.getField(this.expr(expr.expr, null), expr.fieldName);
      case "index":
        return this.obj.getIndex(this.expr(expr.expr, null), expr.index);
      case "unaryOp": {
        const op = this.unaryOps.get(expr.operator);
        // istanbul ignore next
        if (!op) throw new Error("unknown operator");
        return this.func.op(op.op, op.type, [expr.expr]);
      }
      case "binaryOp": {
        const op = this.binaryOps.get(expr.operator);
        // istanbul ignore next
        if (!op) throw new Error("unknown operator");
        return this.func.op(op.op, op.type, [expr.left, expr.right]);
      }
      case "do": {
        const { block, type } = this.block(expr.block);
        return { tag: "do", block, type };
      }
      case "if": {
        const predChecker = new CheckerCtx(this.traits);
        const resultChecker = new CheckerCtx(this.traits);
        const resultType = createVar(Symbol("Result"), []);

        const ifCases = expr.cases.map((ifCase) => {
          const predicate = this.expr(ifCase.predicate, null);
          predChecker.unify(boolType, predicate.type);

          const caseResult = this.block(ifCase.block);
          resultChecker.unify(resultType, caseResult.type);
          return { expr: predicate, block: caseResult.block };
        });

        const elseResult = this.block(expr.elseBlock);
        resultChecker.unify(resultType, elseResult.type);

        const type = resultChecker.resolve(resultType);
        return { tag: "if", ifCases, elseBlock: elseResult.block, type };
      }
      case "match": {
        const target = this.expr(expr.expr, null);
        const resultChecker = new CheckerCtx(this.traits);
        const resultType = createVar(Symbol("Result"), []);
        const matcher = this.obj.createMatcher(target);

        const matchCases = expr.cases.map((matchCase) => {
          return this.scope.blockScope(() => {
            const { index, block: header } = matcher.case(matchCase.binding);
            const { block, type } = this.block(matchCase.block);
            resultChecker.unify(resultType, type);
            return { index, block: [...header, ...block] };
          });
        });

        const type = resultChecker.resolve(resultType);
        return {
          tag: "match",
          expr: target,
          binding: matcher.binding,
          matchCases,
          type,
        };
      }
      default:
        noMatch(expr);
    }
  }
  block(inBlock: Stmt[]): { block: CheckedStmt[]; type: Type } {
    return this.scope.blockScope(() => {
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
        return tupleType(
          typeExpr.typeArgs.map((arg) => this.typeExpr(arg, typeParams))
        );
      case "func":
        return funcType(
          this.typeExpr(typeExpr.returnType, typeParams),
          typeExpr.parameters.map((p) => this.typeExpr(p, typeParams)),
          [] // TODO: something with type params here?
        );
      case "array":
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
        if (bindings.rest.length) throw new Error("todo");
        return [{ tag: "let", binding: bindings.root, expr }];
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

        return [
          this.func.create(root, typeParams, parameters, returns, stmt.block),
        ];
      }
      case "return":
        return [
          this.scope.return(stmt.expr ? this.expr(stmt.expr, null) : null),
        ];
      case "while": {
        const expr = this.expr(stmt.expr, null);
        new CheckerCtx(this.traits).unify(boolType, expr.type);
        const { block } = this.block(stmt.block);
        return [{ tag: "while", expr, block }];
      }
      case "for": {
        return this.scope.blockScope(() => {
          const expr = this.expr(stmt.expr, null);
          const iter = this.obj.iter(expr);
          const { root, rest } = this.scope.initValue(stmt.binding, iter.type);
          if (rest.length) throw new Error("todo");
          const { block } = this.block(stmt.block);

          return [{ tag: "for", binding: root, expr, block }];
        });
      }
      case "assign": {
        return [this.obj.assign(stmt.target, stmt.index, stmt.value)];
      }
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
}
