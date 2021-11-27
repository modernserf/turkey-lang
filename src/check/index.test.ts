import { check as checkInner } from "./index";
import { lex } from "../lexer";
import { parse } from "../parser";

function check(program: string): boolean {
  checkInner(parse(lex(program)));
  return true;
}

it("checks an empty program", () => {
  expect(check(``)).toBe(true);
});

it("checks literals", () => {
  expect(check("1")).toBe(true);
  expect(check("1.5")).toBe(true);
  expect(check(`"hello"`)).toBe(true);
});

it("checks identifiers", () => {
  const code = `
    let x = 1
    let y = 1.5
    let z = "hello"
    let a: Int = 2
    let b: Float = 2.5
    let c: String = "goodbye"
    let d = x
    let e: Float = y
  `;
  expect(check(code)).toBe(true);
});

it("errors unbound variables", () => {
  expect(() => check("x")).toThrow();
});

it("rejects type mismatches in let bindings", () => {
  const code = `
    let x: Int = "hello"
  `;
  expect(() => check(code)).toThrow();
});

it("checks binary operators", () => {
  const code = `
    let a: Bool = 1 < 2
    let b: Int = 1 + 2
    let c: Float = 1.5 - 2.5
  `;
  expect(check(code)).toBe(true);
});

it("checks unary operators", () => {
  const code = `
    let a: Bool = !(1 < 2)
    let b: Int = -1
    let c: Float = -1.5
  `;
  expect(check(code)).toBe(true);
});

it("rejects type mismatches in operators", () => {
  expect(() => check(`!"hello"`)).toThrow();
  expect(() => check(`"hello" + "goodbye"`)).toThrow();
  expect(() => check(`1 ! 2`)).toThrow();
  expect(() => check(`1 + 1.5`)).toThrow();
});

it("checks funcs", () => {
  const code = `
    func foo (a: Int, b: Float): Int {
      print(b)
      return a + 1
    }

    let res: Int = foo(1, 1.5)
  `;
  expect(check(code)).toBe(true);
});

it("checks implicit returns", () => {
  const code = `
    func foo (a: Int, b: Float): Int {
      a + 1
    }

    let res: Int = foo(1, 1.5)
  `;
  expect(check(code)).toBe(true);
});

it("checks void returns", () => {
  const code = `
    func foo (a: Int, b: Float): Void {}
    func bar (a: Int, b: Float): Void {
      let x = a
    }
    func baz (a: Int, b: Float): Void {
      return
    }
    func quux (a: Int, b: Float): Void {
      return print("hello")
    }
  `;
  expect(check(code)).toBe(true);
});

it("rejects invalid returns", () => {
  const code = `
    func foo (a: Int, b: Float): Int {
      return "foo"
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects invalid implicit returns", () => {
  const code = `
    func foo (a: Int, b: Float): Int {
      b
    }

    let res: Int = foo(1, 1.5)
  `;
  expect(() => check(code)).toThrow();
});

it("checks closures", () => {
  const code = `
    let outer = 1

    func foo (a: Int, b: Float): Int {
      print(a + 1)
      print(b + 1.0)
      return outer
    }

    let res: Int = foo(1, 1.5)
  `;
  expect(check(code)).toBe(true);
});

it("checks parameterized functions", () => {
  const code = `
    func foo<Type> (a: Type, b: Type): Type {
      return b
    }

    let first: Int = foo(1, 2)
    let second: String = foo("hello", "goodbye")
  `;
  expect(check(code)).toBe(true);
});

it("rejects any operations on unconstrained param types", () => {
  const code = `
    func foo<Type> (a: Type, b: Type): Type {
      return a + b
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects mismatches in param types", () => {
  const code = `
    func foo<Type> (a: Type, b: Type): Type {
      return b
    }
    foo(1, 1.5)
  `;
  expect(() => check(code)).toThrow();
});

it("allows funcs as parameters and return values", () => {
  const code = `
    func k<T> (value: T): func (): T {
      func get_value(): T {
        return value
      }
      return get_value
    }

    let get = k(1)
    print(get())
  `;

  expect(check(code)).toBe(true);
});

it("allows parameterized funcs as parameters and return values", () => {
  const code = `
    func k<T> (value: T): func <U> (U): T {
      func get_value<U> (drop: U): T {
        return value
      }
      return get_value
    }

    let get = k(1)
    print(get("dropped"))
  `;

  expect(check(code)).toBe(true);
});

it("has func literals", () => {
  const code = `
    func map<T, U> (cell: T, mapper: func (T): U): U {
      return mapper(cell)
    }
    
    let cell = 1
    let mapped = map(cell, |x| x < 10)
    if (mapped) {
      print("here")
    }
  `;
  expect(check(code)).toBe(true);
});

it("is order-dependent when inferring func literal types", () => {
  const code = `
    func map<T, U> (mapper: func (T): U, cell: T): U {
      return mapper(cell)
    }
    
    let cell = 1
    let mapped = map(|x| x < 10, cell)
    if (mapped) {
      print("here")
    }
  `;
  expect(() => check(code)).toThrow();
});

it("chains func calls", () => {
  const code = `
    func map<T, U> (cell: T, mapper: func (T): U): U {
      return mapper(cell)
    }

    let init = 1
    let result = init
      .map(|x| x + 1)
      .map(|x| if (x < 10) { 0.0 } else { 1.0 })
      .map(|x| x + 2.0)
      
  `;
  expect(check(code)).toBe(true);
});

it("has void func literals", () => {
  const code = `
    func each(item: Int, fn: func (Int): Void): Void {
      fn(item)
    }

    1.each(|x| { 
      print(x)
      return 
    })
  `;
  expect(check(code)).toBe(true);
});
