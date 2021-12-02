export type Builtin =
  | "add"
  | "sub"
  | "mul"
  | "mod"
  | "div"
  | "neg"
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "and"
  | "or"
  | "xor"
  | "not"
  | "print_num"
  | "print_string";

export type IRExpr =
  | { tag: "primitive"; value: number }
  | { tag: "string"; value: string }
  | { tag: "object"; value: IRExpr[] }
  | { tag: "ident"; value: symbol }
  | { tag: "recur" }
  | {
      tag: "func";
      upvalues: Array<{ binding: symbol; expr: IRExpr }>;
      parameters: symbol[];
      block: IRStmt[];
    }
  | { tag: "call"; callee: IRExpr; args: IRExpr[]; hasValue: boolean }
  | { tag: "builtin"; value: Builtin; args: IRExpr[] }
  | { tag: "field"; target: IRExpr; index: number }
  | { tag: "do"; block: IRStmt[] }
  | {
      tag: "if";
      ifCases: Array<{ expr: IRExpr; block: IRStmt[] }>;
      elseBlock: IRStmt[];
    }
  | {
      tag: "match";
      expr: IRExpr;
      binding: symbol;
      matchCases: Array<{ index: number; block: IRStmt[] }>;
    };

export type IRStmt =
  | { tag: "expr"; expr: IRExpr }
  | { tag: "let"; binding: symbol; expr: IRExpr }
  | { tag: "for"; binding: symbol; expr: IRExpr; block: IRStmt[] }
  | { tag: "while"; expr: IRExpr; block: IRStmt[] }
  | { tag: "return"; expr: IRExpr | null };

type IRExprLiteral = string | symbol | number | IRExprLiteral[] | IRExpr;
type IRStmtLiteral = IRExprLiteral | IRStmt;

export function expr_(value: IRExprLiteral): IRExpr {
  switch (typeof value) {
    case "string":
      return { tag: "string", value };
    case "symbol":
      return { tag: "ident", value };
    case "number":
      return { tag: "primitive", value };
    default:
      if (Array.isArray(value)) {
        return { tag: "object", value: value.map((item) => expr_(item)) };
      } else {
        return value;
      }
  }
}

function stmt_(value: IRStmtLiteral): IRStmt {
  if (typeof value !== "object" || Array.isArray(value))
    return { tag: "expr", expr: expr_(value) };
  switch (value.tag) {
    case "expr":
    case "let":
    case "for":
    case "while":
    case "return":
      return value;
    default:
      return { tag: "expr", expr: value };
  }
}

export const recur_: IRExpr = { tag: "recur" };

export function func_(
  upvalues: symbol[],
  parameters: symbol[],
  block: IRStmtLiteral[]
): IRExpr {
  return {
    tag: "func",
    upvalues: upvalues.map((binding) => ({
      binding,
      expr: expr_(binding),
    })),
    parameters,
    block: block.map(stmt_),
  };
}

export function call_(
  callee: IRExprLiteral,
  args: IRExprLiteral[],
  hasValue: boolean
): IRExpr {
  return {
    tag: "call",
    callee: expr_(callee),
    args: args.map(expr_),
    hasValue,
  };
}

export function builtIn_(value: Builtin, args: IRExprLiteral[]): IRExpr {
  return { tag: "builtin", value, args: args.map(expr_) };
}

export function field_(target: IRExprLiteral, index: number): IRExpr {
  return { tag: "field", target: expr_(target), index };
}

export function do_(block: IRStmtLiteral[]): IRExpr {
  return { tag: "do", block: block.map(stmt_) };
}

export function if_(
  ifCases: Array<[expr: IRExprLiteral, block: IRStmtLiteral[]]>,
  elseBlock: IRStmtLiteral[]
): IRExpr {
  return {
    tag: "if",
    ifCases: ifCases.map(([value, block]) => ({
      expr: expr_(value),
      block: block.map(stmt_),
    })),
    elseBlock: elseBlock.map(stmt_),
  };
}

export function match_(
  value: IRExprLiteral,
  binding: symbol,
  matchCases: IRStmtLiteral[][]
): IRExpr {
  return {
    tag: "match",
    expr: expr_(value),
    binding,
    matchCases: matchCases.map((block, i) => ({
      index: i,
      block: block.map(stmt_),
    })),
  };
}

export function let_(binding: symbol, value: IRExprLiteral): IRStmt {
  return { tag: "let", binding, expr: expr_(value) };
}

export function for_(
  binding: symbol,
  value: IRExprLiteral,
  block: IRStmtLiteral[]
): IRStmt {
  return { tag: "for", binding, expr: expr_(value), block: block.map(stmt_) };
}

export function while_(value: IRExprLiteral, block: IRStmtLiteral[]): IRStmt {
  return { tag: "while", expr: expr_(value), block: block.map(stmt_) };
}

export function return_(value: IRExprLiteral | null): IRStmt {
  return { tag: "return", expr: value ? expr_(value) : null };
}

export function program_(program: IRStmtLiteral[]): IRStmt[] {
  return program.map(stmt_);
}

export class PrettyPrinter {
  private indentDepth = 0;
  private indentSize = 2;
  program(program: IRStmt[]): string {
    return "\n" + program.map((stmt) => this.stmt(stmt)).join("\n") + "\n";
  }
  stmt(stmt: IRStmt): string {
    switch (stmt.tag) {
      case "expr":
        return this.expr(stmt.expr).value;
      case "let":
        return `let ${this.binding(stmt.binding)} = ${
          this.expr(stmt.expr).value
        }`;
      case "return":
        if (stmt.expr) {
          return `return ${this.expr(stmt.expr).value}`;
        } else {
          return `return`;
        }
      case "while":
        return `while (${this.expr(stmt.expr)}) ${this.block(stmt.block)}`;
      case "for":
        return `for (${this.binding(stmt.binding)} in ${this.expr(
          stmt.expr
        )}) ${this.block(stmt.block)}`;
    }
  }
  expr(expr: IRExpr): { value: string; multiline?: boolean } {
    switch (expr.tag) {
      case "primitive":
        return { value: String(expr.value) };
      case "string":
        return { value: `"${expr.value}"` };
      case "object":
        return this.exprList(expr.value, "[", "]");
      case "recur":
        return { value: "recur", multiline: false };
      case "ident":
        return { value: this.binding(expr.value) };
      case "func": {
        return {
          value: `func (${expr.parameters
            .map((p) => this.binding(p))
            .join(", ")}) ${this.upvalues(expr.upvalues)} ${this.block(
            expr.block
          )}`,
          multiline: true,
        };
      }
      case "field": {
        const target = this.expr(expr.target);
        return {
          value: `${target.value}:${expr.index}`,
          multiline: target.multiline,
        };
      }
      case "do":
        return {
          value: `do ${this.block(expr.block)}`,
          multiline: true,
        };
      case "if":
        return {
          value: `${expr.ifCases
            .map(
              ({ expr, block }) =>
                `if (${this.expr(expr).value}) ${this.block(block)} else`
            )
            .join(" ")} ${this.block(expr.elseBlock)}`,
          multiline: true,
        };
      case "match":
        return {
          value: `match (${this.expr(expr.expr).value}) {${this.withIndent(() =>
            expr.matchCases.map(
              ({ index, block }) =>
                `${this.tab()}${index} => ${this.block(block)}`
            )
          )}${this.tab()}}`,
          multiline: true,
        };
      case "builtin": {
        const args = this.exprList(expr.args, "(", ")");
        return {
          value: `${expr.value}${args.value}`,
          multiline: args.multiline,
        };
      }
      case "call": {
        const args = this.exprList(expr.args, "(", ")");
        if (expr.callee.tag === "recur") {
          return {
            value: `recur${args.value}`,
            multiline: args.multiline,
          };
        }
        if (expr.callee.tag === "ident") {
          return {
            value: `${this.binding(expr.callee.value)}${args.value}`,
            multiline: args.multiline,
          };
        }
        const callee = this.expr(expr.callee);
        return {
          value: `(${callee.value})${args.value}`,
          multiline: callee.multiline || args.multiline,
        };
      }
    }
  }
  private block(stmt: IRStmt[]): string {
    return `{${this.withIndent(() =>
      stmt.map((s) => `${this.tab()}${this.stmt(s)}`).join("")
    )}${this.tab()}}`;
  }
  private binding(s: symbol): string {
    return s.description ?? "<var>";
  }
  private tab(): string {
    return (
      "\n" +
      Array(this.indentDepth * this.indentSize)
        .fill(" ")
        .join("")
    );
  }
  private withIndent<T>(fn: () => T): T {
    this.indentDepth++;
    try {
      return fn();
    } finally {
      this.indentDepth--;
    }
  }
  private upvalues(upvalues: Array<{ binding: symbol; expr: IRExpr }>): string {
    if (upvalues.length === 0) return "";
    let multiline = false;
    const pairs = upvalues.map(({ binding, expr }) => {
      const res = this.expr(expr);
      if (res.multiline) multiline = true;
      return `${this.binding(binding)} = ${res.value}`;
    });
    return multiline
      ? `with${this.withIndent(() =>
          pairs.map((p) => `${this.tab()}${p}`).join(", ")
        )}\n`
      : `with ${pairs.join(", ")}`;
  }
  private exprList(
    exprs: IRExpr[],
    start: string,
    end: string
  ): { value: string; multiline: boolean } {
    const mapped = exprs.map((e) => this.expr(e));
    const multiline = mapped.some((e) => e.multiline);
    if (multiline) {
      return {
        value: `${start}${this.withIndent(() =>
          mapped.map((e) => `${this.tab()}${e.value},`)
        ).join("")}${this.tab()}${end}`,
        multiline: true,
      };
    } else {
      return {
        value: `${start}${mapped.map((e) => e.value).join(", ")}${end}`,
        multiline: false,
      };
    }
  }
}
