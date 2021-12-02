import { compile } from "./index";
import { interpret } from "../../interpreter";
import { lex } from "../../lexer";
import { parse } from "../../parser";

const run = (code: string) => interpret(compile(parse(lex(code))));

it("runs an empty program", () => {
  expect(run(``)).toEqual([]);
});

it("runs simple expressions with no output", () => {
  const code = `
    let x = 1
    let y = "foo"
  `;
  expect(run(code)).toEqual([]);
});

it("uses built-in polymorphic functions", () => {
  const code = `
    let x = 1
    let y = "foo"
    print(x)
    print(y)
  `;
  expect(run(code)).toEqual(["1", "foo"]);
});
