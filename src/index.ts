import { compile } from "./compiler";
import { interpret } from "./interpreter";
import { parse } from "./parser";
import { lex } from "./lexer";

export default function run(program: string): any[] {
  return interpret(compile(parse(lex(program))));
}
