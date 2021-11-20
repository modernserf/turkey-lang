import { compile } from "./compiler";
import { interpret } from "./interpreter";
import { parse } from "./parser";
import { lex } from "./lexer";
import { check } from "./check-types-2";

export default function run(program: string): any[] {
  return interpret(compile(check(parse(lex(program)))));
}
