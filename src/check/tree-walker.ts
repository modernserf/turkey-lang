import { IRStmt } from "../ir";
import { Expr, Stmt, TypeParam } from "../ast";
import { noMatch } from "../utils";
import { CheckerProvider } from "./checker";
import {
  TreeWalker as ITreeWalker,
  CheckedExpr,
  CheckedStmt,
  voidType,
  intType,
  floatType,
  stringType,
  boolType,
  createVar,
  funcType,
  Type,
  Stdlib,
  tupleType,
  vecType,
  createType,
  Trait,
} from "./types";
import { Scope } from "./scope";
import { Func } from "./func";
import { Traits } from "./trait";
import { Obj } from "./obj";
import { StrictMap } from "../strict-map";

export class TreeWalker implements ITreeWalker {
  private unaryOps = this.stdlib.unaryOps;
  private binaryOps = this.stdlib.binaryOps;
  private traits = new Traits(this.stdlib);
  private checker = new CheckerProvider(this.traits);
  private scope = new Scope(this.stdlib, this.checker);
  private func = new Func(this, this.scope, this.traits, this.checker);
  private obj = new Obj(this, this.checker);
  constructor(private stdlib: Stdlib) {}
  program(program: Stmt[]): IRStmt[] {
    const prelude: IRStmt[] = Array.from(this.stdlib.values).map(
      ([name, expr]) => {
        const binding = this.scope.initValue(
          { tag: "identifier", value: name },
          expr.type
        );

        return { tag: "let", binding: binding.root, expr };
      }
    );

    return [...prelude, ...this.block(program).block];
  }
  expr(expr: Expr, context: Type | null): CheckedExpr {
    switch (expr.tag) {
      case "identifier":
        return this.scope.getValue(expr.value);
      case "integer":
        return { tag: "primitive", value: expr.value, type: intType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
      case "string":
        return { tag: "string", value: expr.value, type: stringType };
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
        const resultChecker = this.checker.create();
        const resultType = createVar(Symbol("Result"), []);

        const ifCases = expr.cases.map((ifCase) => {
          const predicate = this.expr(ifCase.predicate, null);
          this.checker.check(boolType, predicate.type);

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
        const resultChecker = this.checker.create();
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
      // istanbul ignore next
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
  private stmt(stmt: Stmt): CheckedStmt[] {
    switch (stmt.tag) {
      case "expr": {
        const expr = this.expr(stmt.expr, null);
        return [{ tag: "expr", expr, type: expr.type }];
      }
      case "type": {
        const paramList = this.typeParams(stmt.binding.typeParameters);
        const type = this.scope.getType(
          stmt.type,
          this.paramListToMap(paramList)
        );

        this.scope.initTypeAlias(
          stmt.binding.value,
          paramList.map((p) => p.type),
          type
        );
        return [];
      }
      case "struct": {
        const paramList = this.typeParams(stmt.binding.typeParameters);

        const type = createType(
          Symbol(stmt.binding.value),
          paramList.map((p) => p.type)
        );
        this.scope.initType(stmt.binding.value, type);
        this.scope.initStructConstructor(stmt.binding.value, type);

        const typeParams = this.paramListToMap(paramList);
        const fields = stmt.fields.map((field) => {
          return {
            name: field.fieldName,
            type: this.scope.getType(field.type, typeParams),
          };
        });

        this.obj.initStruct(type, fields);

        return [];
      }
      case "structTuple":
      case "enum":
      case "trait":
      case "impl":
        throw new Error("todo");
      case "let": {
        const type = stmt.type ? this.scope.getType(stmt.type) : null;
        const expr = this.expr(stmt.expr, type);
        if (type) {
          this.checker.check(type, expr.type);
        }
        const bindings = this.scope.initValue(stmt.binding, expr.type);
        if (bindings.rest.length) throw new Error("todo");
        return [{ tag: "let", binding: bindings.root, expr }];
      }
      case "func": {
        // for each type param:
        // - create a new abstract type
        // - look up associated traits
        const paramList = this.typeParams(stmt.typeParameters);
        // map of type param name -> type used when checking param & return types
        const varMap = this.paramListToMap(paramList);
        // hidden trait impl params, flattened out from type params
        // func foo <T: Foo + Bar, U, V: Baz> => [Foo, Bar, Baz]
        const traitParams = paramList.flatMap(({ type, traits }) => {
          return traits.map((trait) => ({ type, trait }));
        });

        const parameters = stmt.parameters.map((p) => {
          const binding = p.binding;
          const type = this.scope.getType(p.type, varMap);
          return { binding, type };
        });

        const returns = this.scope.getType(stmt.returnType, varMap);
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
          this.func.create(root, paramList, parameters, returns, stmt.block),
        ];
      }
      case "return":
        return [
          this.scope.return(stmt.expr ? this.expr(stmt.expr, null) : null),
        ];
      case "while": {
        const expr = this.expr(stmt.expr, null);
        this.checker.check(boolType, expr.type);
        const { block } = this.block(stmt.block);
        return [{ tag: "while", expr, block }];
      }
      case "for": {
        const expr = this.expr(stmt.expr, null);
        const iter = this.obj.iter(expr);
        return this.scope.blockScope(() => {
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
  private typeParams(
    params: TypeParam[]
  ): Array<{ name: string; type: Type; traits: Trait[] }> {
    return params.map((p) => {
      const traits = p.traits.map((t) => this.traits.getTrait(t));
      const type = createVar(Symbol(p.value), traits);
      return { name: p.value, type, traits };
    });
  }
  private paramListToMap(
    paramList: Array<{ name: string; type: Type }>
  ): StrictMap<string, Type> {
    return new StrictMap(paramList.map((p) => [p.name, p.type]));
  }
}
