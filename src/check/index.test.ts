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
      // print(arg)
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

it("supports arithmetic operators", () => {
  const code = `
    print(-1)
    print(1 + 2)
    print(1.5 * 2.5)
    print((1 / 3) + 0.6667) 
  `;
  expect(check(code)).toBeTruthy();
});

it("allows closures with type context", () => {
  const code = `
    let fn: func (Int): Int = |x| { x + 1 } 
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects closures without type context", () => {
  const code = `
    let fn = |x| { x + 1 } 
  `;
  expect(() => check(code)).toThrow();
});

it("supports fixed-size array types", () => {
  const code = `
    let xs: Array[Int; 4] = Array[255,255,255,0]
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects size mismatches in array types", () => {
  const code = `
    let xs: Array[Int; 4] = Array[0;1]
  `;
  expect(() => check(code)).toThrow();
});

it("has type aliases", () => {
  const code = `
    type Int4 = Array[Int; 4]
    let xs: Int4 = Array[255,255,255,0]

    type IdFunc<T> = func (T): T
    let id_int: IdFunc<Int> = |x| x
    id_int(1)
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects type aliases arity mismatch", () => {
  const code = `
    type IdFunc<T> = func (T): T
    let id_int: IdFunc = |x| x
  `;
  expect(() => check(code)).toThrow();
  const code2 = `
    type IdFunc<T> = func (T): T
    let id_int: IdFunc<Int, Int> = |x| x
  `;
  expect(() => check(code2)).toThrow();
});

it("uses structs", () => {
  const code = `
    struct Point { x: Int, y: Int }
    let p = Point { x: 1, y: 2 }
    let x = p:x
  `;
  expect(check(code)).toBeTruthy();
});

it("provides context in structs", () => {
  const code = `
    struct Foo <Fn> {
      foo: func (Int): Int,
      bar: Fn,
    }

    let f: Foo<func (Float): Float> = Foo {
      foo: |x| x,
      bar: |x| x,
    }

    f:foo(1)
    f:bar(1.5)
  `;
  expect(check(code)).toBeTruthy();
});

it("rejects incomplete tuple destructuring", () => {
  const code = `
    struct Point (Int, Int)

    let (x) = Point(10,20)

    print(x)
  `;
  expect(() => check(code)).toThrow();
});
