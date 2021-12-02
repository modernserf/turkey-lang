import { compile } from "./junk/compiler";
import { interpret } from "./interpreter";
import { parse } from "./parser";
import { lex } from "./lexer";
import { check } from "./junk/check";

export default function run(program: string): any[] {
  return interpret(compile(check(parse(lex(program)))));
}
