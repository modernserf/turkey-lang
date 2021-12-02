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

it("rejects invalid type expressions", () => {
  const code = `
    let x: FakeType = 1
  `;
  expect(() => check(code)).toThrow();
});

it("checks funcs", () => {
  const code = `
    func foo (x: Int, y: Float): Int {
      x
    }
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects funcs with implicit return type mismatches", () => {
  const code = `
    func foo (x: Int, y: Float): Int {
      y
    }
  `;
  expect(() => check(code)).toThrow();
});

it("calls funcs", () => {
  const code = `
    func foo (x: Int, y: Float): Int {
      x
    }
    let result = foo(1, 1.5)
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects func calls with the wrong arity", () => {
  const code = `
    func foo (x: Int, y: Float): Int {
      x
    }
    let result = foo(1)
  `;
  expect(() => check(code)).toThrow();
});

it("rejects func calls with the wrong types", () => {
  const code = `
    func foo (x: Int, y: Float): Int {
      x
    }
    let result = foo(1, 2)
  `;
  expect(() => check(code)).toThrow();
});

it("rejects func calls on non-funcs", () => {
  const code = `
    let foo = 1
    let result = foo(1, 2)
  `;
  expect(() => check(code)).toThrow();
});

it("calls funcs with trait args", () => {
  const code = `
    print(1) 
    print(1.5)
    print("foo")
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects func calls with args that do not match traits", () => {
  const code = `
    func num <T: Num> (arg: T): Void {}
    num("hello")
  `;

  expect(() => check(code)).toThrow();
});

it("propagates generic types", () => {
  const code = `
    func id <T> (arg: T): T { arg }  
    let x: Int = id(1)
  `;
  expect(check(code)).toBeTruthy();
});

it("propagates trait params", () => {
  const code = `
    func print_twice <T: Show> (arg: T): Void {
      print(arg)
      print(arg)
    }
  
    print_twice(1)
    print_twice("hello")
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects unknown traits", () => {
  const code = `
    func print_twice <T: Nope> (arg: T): Void { }
  `;
  expect(() => check(code)).toThrow();
});
