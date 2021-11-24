import { check as checkInner } from "./check-type-3";
import { lex } from "./lexer";
import { parse } from "./parser";

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

it("checks built-in func calls", () => {
  const code = `
    print_int(1)
    let x = 2
    print_int(x)
    print_float(1.5)
    print_string("hello")
  `;
  expect(check(code)).toBe(true);
});

it("rejects type mismatches in built-in func calls", () => {
  expect(() => check(`print_int("hello")`)).toThrow();
  expect(() => check(`print_int()`)).toThrow();
  expect(() => check(`print_int(1, 2)`)).toThrow();
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
      print_int(a)
      print_float(b)
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
      return print_string("hello")
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
      print_int(a)
      print_float(b)
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
    print_int(get())
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
    print_int(get("dropped"))
  `;

  expect(check(code)).toBe(true);
});

it("has simple type constructors", () => {
  const code = `
    let foo = !!True
    let bar: Bool = False
    
    func baz (): Void {
      return Void
    }
  `;
  expect(check(code)).toBe(true);
});

it("has structs", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1, y: 2 }
    print_int(p:x)
  `;
  expect(check(code)).toBe(true);
});

it("has parameterized structs", () => {
  const code = `
    struct Point<T> {
      x: T,
      y: T,  
    }
    let p = Point { x: 1.5, y: 2.5 }
    print_float(p:x)
  `;
  expect(check(code)).toBe(true);
});

it("progagates struct parameters in func calls", () => {
  const code = `
    struct Point<T> {
      x: T,
      y: T,  
    }

    func get_x<T> (p: Point<T>): T {
      return p:x
    } 

    let p = Point { x: 1.5, y: 2.5 }
    print_float(get_x(p))
  `;
  expect(check(code)).toBe(true);
});

it("rejects incomplete struct constructions", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1 }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects duplicate fields in struct constructions", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1, x: 2, y: 3 }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects unknown fields in struct constructions", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1, y: 2, z: 3 }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects type mismatches in structs", () => {
  const code = `
    struct Point<T> {
      x: T,
      y: T,  
    }
    let p = Point { x: 1, y: 1.5 }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects accessing unknown fields", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1, y: 2 }
    p:z
  `;
  expect(() => check(code)).toThrow();
});

it("rejects accessing fields on non-structs", () => {
  const code = `
    "foo":y
  `;
  expect(() => check(code)).toThrow();
});

it("has func literals", () => {
  const code = `
    struct Cell<T> {
      value: T,
    }

    func map<T, U> (cell: Cell<T>, mapper: func (T): U): Cell<U> {
      let prev = cell:value
      let next = mapper(prev)
      return Cell { value: next } 
    }
    
    let cell = Cell { value: 1 }
    let mapped = map(cell, |x| { x < 10 })
    let result = mapped:value
  `;
  expect(check(code)).toBe(true);
});

it("is order-dependent when inferring func literal types", () => {
  const code = `
    struct Cell<T> {
      value: T,
    }

    func map<T, U> (mapper: func (T): U, cell: Cell<T>): Cell<U> {
      let prev = cell:value
      let next = mapper(prev)
      return Cell { value: next } 
    }
    
    let cell = Cell { value: 1 }
    let mapped = map(|x| { x < 10 }, cell)
    let result = mapped:value
  `;
  expect(() => check(code)).toThrow();
});

it("has tuples", () => {
  const code = `
    func foo (t: (Int, String)): String {
      t:1
    }
    print_string(foo((1, "hello")))
  `;
  expect(check(code)).toBe(true);
});

it("rejects accessing nonexistent tuple fields", () => {
  const code = `
    let t = (1, "hello")
    t:3
  `;
  expect(() => check(code)).toThrow();
});

it("destructures struct bindings", () => {
  const code = `
    struct Point { x: Int, y: Int }
    let point = Point { x: 1, y: 2 }
    let { x } = point
    print_int(x) 
  `;
  expect(check(code)).toBe(true);
});

it("destructures tuples", () => {
  const code = `
    let pair = (1, "hello")
    let (num, word) = pair
    print_int(num)
    print_string(word)
  `;
  expect(check(code)).toBe(true);
});

it("has do blocks", () => {
  const code = `
    let x = do {
      let a = 1
      let b = 2
      a + b
    }
    let y: Int = x
  `;
  expect(check(code)).toBe(true);
});

it("has simple enums", () => {
  const code = `
    enum AST {
      Num(Int),
      Add(AST, AST),
      Sub(AST, AST),
      Neg(AST),
    }

    func calc (ast: AST): Int {
      match (ast) {
        Num(value) => value,
        Add(l, r) => calc(l) + calc(r),
        Sub(l, r) => calc(l) - calc(r),
        Neg(node) => -(calc(node)),
      }
    }

    calc(Add(Num(3), Neg(Sub(Num(5), Num(2)))))
  `;
  expect(check(code)).toBe(true);
});

it("rejects duplicate branches in declarations", () => {
  const code = `
    enum Foo {
      Bar,
      Bar(Int)
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects pattern matching on non-enums", () => {
  const code = `
    match (1) {
      Bar(x) => x,
      Baz(str) => 0,
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects duplicate branches in pattern matches", () => {
  const code = `
    enum Foo {
      Bar(Int),
      Baz(String)
    }
    match (Bar(1)) {
      Bar(x) => x,
      Bar(x) => x + 1,
      Baz(str) => 0,
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects unknown branches in pattern matches", () => {
  const code = `
    enum Foo {
      Bar(Int),
      Baz(String)
    }
    match (Bar(1)) {
      Bar(x) => x,
      Baz(str) => 0,
      Quux => 1,
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects incomplete branches in pattern matches", () => {
  const code = `
    enum Foo {
      Bar(Int),
      Baz(String)
    }
    match (Bar(1)) {
      Bar(x) => x,
    }
  `;
  expect(() => check(code)).toThrow();
});

it("rejects type mismatches in pattern match results", () => {
  const code = `
    enum Foo {
      Bar(Int),
      Baz(String)
    }
    match (Bar(Int)) {
      Bar(x) => x,
      Baz(str) => str,
    }
  `;
  expect(() => check(code)).toThrow();
});

it.skip("has complex enums & pattern matching", () => {
  const code = `
    enum List<T> {
      Nil,
      Cons(T, List<T>)
    }

    func map<T, U> (list: List<T>, mapper: func (T): U): List<U> {
      match (list) {
        Nil => Nil,
        Cons(head, tail) => Cons(mapper(head), tail.map(mapper)),
      }
    }
  
    let list = Cons(1, Cons(2, Cons(3, Nil)))

    list.map(|x| { x + 1 })
  `;
  expect(check(code)).toBe(true);
});
