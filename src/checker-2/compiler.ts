import { Scope } from "../scope";
import { noMatch } from "../utils";
import { Writer } from "../writer";
import { BaseTypedExpr, StdLib, TypedStmt } from "./types";

export class Compiler {
  private asm = new Writer();
  private vars = new Scope<string, number>();
  private strings = new Map<string, number>();
  constructor(stdlib: StdLib) {
    // stdlib.values.forEach(({ name, expr }, i) => {
    //   this.expr(expr);
    //   this.vars.init(name, i);
    // });
  }
  program(program: TypedStmt[]): {
    program: number[];
    constants: string[];
  } {
    for (const stmt of program) {
      this.stmt(stmt);
    }

    this.asm.halt();

    return {
      program: this.asm.compile(),
      constants: this.getConstants(),
    };
  }
  // private block(block: TypedStmt[]) {
  //   block.forEach((stmt) => {
  //     this.stmt(stmt);
  //   });
  // }
  private stmt(stmt: TypedStmt): void {
    switch (stmt.tag) {
      case "expr":
        this.expr(stmt.expr);
        return;
      case "let": {
        this.expr(stmt.expr);
        const index = this.vars.size;
        this.vars.set(stmt.name, index);
        return;
      }
      default:
        noMatch(stmt);
    }
  }
  private expr(expr: BaseTypedExpr): void {
    switch (expr.tag) {
      case "primitive":
        this.asm.loadPrimitive(expr.value);
        return;
      case "string":
        this.asm.loadPointer(this.useString(expr.value));
        return;
      case "root":
        this.asm.loadRoot(this.vars.get(expr.value));
        return;
      case "local":
        this.asm.loadLocal(this.vars.get(expr.value));
        return;
      case "builtin":
        expr.traitArgs.forEach(() => {
          throw new Error("todo");
        });
        expr.args.forEach((arg) => {
          this.expr(arg);
        });
        this.asm.writeOpcode(...expr.code);
        return;
      case "call":
      case "func":
      case "upvalue":
        throw new Error("todo");
      default:
        noMatch(expr);
    }
  }
  useString(str: string) {
    if (this.strings.has(str)) {
      return this.strings.get(str) as number;
    }
    this.strings.set(str, this.strings.size + 1);
    return this.strings.size + 1;
  }
  getConstants(): string[] {
    return Array.from(this.strings.keys());
  }
}
