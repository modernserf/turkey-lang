import { Scope } from "../scope";
import { Expr, Opcode, Stmt, TypeExpr, TypeParam } from "../types";
import {
  TreeWalker as ITreeWalker,
  BlockScope,
  Op,
  Func,
  Obj,
  CheckedBlock,
  BoundType,
  TypedExpr,
  CheckedStmt,
  Type,
  createType,
  voidType,
  intType,
  floatType,
  stringType,
  boolType,
  funcType,
  tupleType,
  createVar,
  Traits,
  TypeParamScope,
} from "./types";

import { noMatch } from "../utils";
import { unify } from "./checker";

export class TreeWalker implements ITreeWalker {
  public scope!: BlockScope;
  public op!: Op;
  public func!: Func;
  public obj!: Obj;
  public traits!: Traits;
  public block(block: Stmt[]): CheckedBlock {
    return this.scope.inScope(() => {
      const checkedBlock = block.flatMap((stmt) => this.stmt(stmt));
      const lastStmt = checkedBlock[checkedBlock.length - 1];
      if (lastStmt?.tag === "expr") {
        return { block: checkedBlock, type: lastStmt.type };
      } else {
        return { block: checkedBlock, type: voidType };
      }
    });
  }
  public expr(expr: Expr, typeHint: BoundType | null): TypedExpr {
    switch (expr.tag) {
      case "identifier":
        return {
          tag: "identifier",
          value: expr.value,
          type: this.scope.getVar(expr.value),
        };
      case "integer":
        return { tag: "primitive", value: expr.value, type: intType };
      case "float":
        return { tag: "primitive", value: expr.value, type: floatType };
      case "string":
        return { tag: "string", value: expr.value, type: stringType };
      case "do":
        return { tag: "do", ...this.block(expr.block) };
      case "if": {
        const checkedCases = expr.cases.map((ifCase) => {
          const predicate = this.checkPredicate(ifCase.predicate);
          const { type, block } = this.block(ifCase.block);
          return { predicate, block, type };
        });
        const { block: elseBlock, type: elseType } = this.block(expr.elseBlock);
        const type = checkedCases.reduce((type, ifCase) => {
          return unify(type, ifCase.type);
        }, elseType);

        return { tag: "if", cases: checkedCases, elseBlock, type };
      }
      case "match": {
        const target = this.expr(expr.expr, null);
        const matchTarget = this.obj.checkMatchTarget(target.type);
        const matchCases = expr.cases.map((matchCase) => {
          return this.scope.inScope(() => {
            const bindings = matchTarget.matchBinding(matchCase.binding);
            const { block, type } = this.block(matchCase.block);
            return { tag: matchCase.binding.value, bindings, block, type };
          });
        });
        const type = matchCases.length
          ? matchCases.map((c) => c.type).reduce((l, r) => unify(l, r))
          : voidType;

        return {
          tag: "match",
          expr: target,
          cases: matchTarget.sortCases(matchCases),
          type,
        };
      }
      case "tuple":
        return this.obj.createTuple(expr.fields, typeHint);
      case "list":
        return this.obj.createList(expr.items, typeHint);
      case "typeConstructor":
        return this.obj.createTagged(expr.value, expr.fields, typeHint);
      case "field": {
        const target = this.expr(expr.expr, null);
        const { index, type } = this.obj.getField(target.type, expr.fieldName);
        return { tag: "field", expr: target, index, type };
      }
      case "closure":
        return this.func.createClosure(expr.parameters, expr.block, typeHint);
      case "call": {
        const callee = this.expr(expr.expr, null);
        const result = this.func.call(callee, expr.args);
        // FIXME
        if ((result as any)?.callee?.value === "print") {
          const argType = (result as any)?.args?.[0]?.type?.name;
          if (argType === stringType.name) {
            return {
              ...(result as any),
              callee: {
                tag: "builtIn",
                opcode: [Opcode.PrintStr],
              },
            };
          } else {
            return {
              ...(result as any),
              callee: {
                tag: "builtIn",
                opcode: [Opcode.PrintNum],
              },
            };
          }
        }

        return result;
      }
      case "unaryOp":
        return this.func.call(this.op.unary(expr.operator), [expr.expr]);

      case "binaryOp":
        return this.func.call(this.op.binary(expr.operator), [
          expr.left,
          expr.right,
        ]);
      // istanbul ignore next
      default:
        noMatch(expr);
    }
  }
  private stmt(stmt: Stmt): CheckedStmt[] {
    switch (stmt.tag) {
      case "expr": {
        const expr = this.expr(stmt.expr, null);
        return [
          {
            tag: "expr",
            expr,
            type: expr.type,
            hasValue:
              expr.type.name !== voidType.name &&
              expr.type.parameters.length === 0,
          },
        ];
      }
      case "func": {
        return [
          this.func.createFunc(
            stmt.name,
            this.getTypeParameters(stmt.typeParameters),
            stmt.parameters,
            stmt.returnType,
            stmt.block
          ),
        ];
      }
      case "return":
        return [{ tag: "return", expr: this.func.return(stmt.expr) }];

      case "struct":
        this.obj.declareStruct(
          stmt.binding.value,
          this.getTypeParameters(stmt.binding.typeParameters),
          stmt.fields,
          stmt.isTuple
        );
        return [];
      case "enum":
        this.obj.declareEnum(
          stmt.binding.value,
          this.getTypeParameters(stmt.binding.typeParameters),
          stmt.cases
        );
        return [];
      case "let": {
        let typeHint: BoundType | null = null;
        if (stmt.type) {
          const t = this.typeExpr(stmt.type);
          if (t.tag === "var") throw new Error("unbound type");
          typeHint = t;
        }
        const expr = this.expr(stmt.expr, typeHint);
        if (typeHint) {
          unify(typeHint, expr.type);
        }
        const binding = this.scope.initVar(stmt.binding, expr.type);
        return [{ tag: "let", expr, binding }];
      }
      case "for":
        return this.scope.inScope(() => {
          const { iter, target } = this.obj.getIterator(stmt.expr);
          const binding = this.scope.initVar(stmt.binding, iter);
          const { block } = this.block(stmt.block);
          return [{ tag: "for", binding, block, expr: target }];
        });
      case "while": {
        const expr = this.checkPredicate(stmt.expr);
        const { block } = this.block(stmt.block);
        return [{ tag: "while", expr, block }];
      }
      case "type":
      case "trait":
      case "impl":
        throw new Error("todo");
      // istanbul ignore next
      default:
        noMatch(stmt);
    }
  }
  public typeExpr(
    typeExpr: TypeExpr,
    vars: TypeParamScope = new Scope()
  ): Type {
    switch (typeExpr.tag) {
      case "identifier": {
        // TODO: if this is a type alias, need to resolve the alias
        const baseType = vars.has(typeExpr.value)
          ? vars.get(typeExpr.value)
          : this.scope.getType(typeExpr.value);
        if (!typeExpr.typeArgs.length) return baseType;
        const parameters = typeExpr.typeArgs.map((expr) =>
          this.typeExpr(expr, vars)
        );

        const created = createType(baseType.name, parameters, baseType.traits);
        return created;
      }
      case "func": {
        const nextVars = this.getTypeParameters(
          typeExpr.typeParameters,
          vars.push()
        );
        return funcType(
          typeExpr.parameters.map((p) => this.typeExpr(p, nextVars)),
          this.typeExpr(typeExpr.returnType, nextVars)
        );
      }
      case "tuple":
        return tupleType(typeExpr.typeArgs.map((t) => this.typeExpr(t, vars)));
      // istanbul ignore next
      default:
        noMatch(typeExpr);
    }
  }
  private checkPredicate(expr: Expr): TypedExpr {
    const checked = this.expr(expr, null);
    unify(checked.type, boolType);
    return checked;
  }
  private getTypeParameters(
    typeParameters: TypeParam[],
    typeVars: TypeParamScope = new Scope()
  ): TypeParamScope {
    typeParameters.forEach((p) => {
      const traits = p.traits.map((traitExpr) =>
        this.traits.getTraitConstraint(traitExpr)
      );
      const typeVar = createVar(Symbol(p.value), traits);
      typeVars.init(p.value, typeVar);
    });
    return typeVars;
  }
}
