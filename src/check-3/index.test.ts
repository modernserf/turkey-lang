import { check as checkInner } from "./index";
import { lex } from "../lexer";
import { parse } from "../parser";

const check = (code: string) => checkInner(parse(lex(code)));

it("checks an empty program", () => {
  const code = ``;
  expect(check(code)).toBeTruthy();
});

it("checks simple expressions", () => {
  const code = `
    let x = 1
    let y = 1.5
    let z = "foo" 
  `;
  expect(check(code)).toBeTruthy();
});

it("checks do blocks", () => {
  const code = `
    let x = do {
      let a = 1
      let b = 2
      a
    }
  `;
  expect(check(code)).toBeTruthy();
});

it("checks let bindings with types", () => {
  const code = `
    let x: Int = 1
    let y: Float = 1.5
    let z: String = "foo" 
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects invalid types in let bindings", () => {
  const code = `
    let x: String = 1
  `;
  expect(() => check(code)).toThrow();
});
