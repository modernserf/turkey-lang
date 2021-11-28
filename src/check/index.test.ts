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

it("checks do blocks", () => {
  const code = `
    let a = do {
      let x = 1
      let y = 2
      x + y
    }
    print(a + 1)
  `;
  expect(check(code)).toBe(true);
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

it("rejects func literals without type info", () => {
  const code = `
    let mapper = |x| x < 10
  `;
  expect(() => check(code)).toThrow();
});

it("allows func literals with explicit type info", () => {
  const code = `
    let mapper: func (Int): Bool = |x| x > 10
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

it("has tuples", () => {
  const code = `
    let pair = (1, "hello")

    let (num, str) = pair
    let other_num = pair:0
    let typed : (Int, String) = pair

    print(num + other_num)
  `;
  expect(check(code)).toBe(true);
});

it("rejects incomplete destructuring", () => {
  const code = `
    let pair = (1, "hello")

    let (num) = pair
  `;
  expect(() => check(code)).toThrow();
});

it("rejects invalid destructuring", () => {
  const code = `
    let pair = (1, "hello")

    let (num, str, other) = pair
  `;
  expect(() => check(code)).toThrow();
});

it("rejects invalid field access", () => {
  const code = `
    let pair = (1, "hello")

    let other = pair:2
  `;
  expect(() => check(code)).toThrow();
});

it("rejects invalid type hints", () => {
  const code = `
    let pair: Int = (1, "hello")
  `;
  expect(() => check(code)).toThrow();
  const code2 = `
    let pair: (Int, String, Float) = (1, "hello")
  `;
  expect(() => check(code2)).toThrow();
  const code3 = `
    let pair: (Int, Int) = (1, "hello")
  `;
  expect(() => check(code3)).toThrow();
});

it("has structs", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,  
    }
    let p = Point { x: 1, y: 2 }
    print(p:x)
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
    print(p:x)
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
    print(get_x(p))
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

it("has complex enums & pattern matching", () => {
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
    list.map(|x| { 1.5 }).map(|x| { "hello" })
  `;
  expect(check(code)).toBe(true);
});

it("has built-in lists", () => {
  const code = `
    func map<T, U> (list: List<T>, mapper: func (T): U): List<U> {
      match (list) {
        Nil => [],
        Cons(head, tail) => Cons(mapper(head), tail.map(mapper)),
      }
    }

    let list = [1,2,3]
    list.map(|x| { 1.5 }).map(|x| { "hello" })
  `;
  expect(check(code)).toBe(true);
});

it("has for in loops", () => {
  const code = `
    for (x in [1,2,3]) {
      print(x + 1)
    }
  `;
  expect(check(code)).toBe(true);
});

it("rejects iterating over non-lists", () => {
  const code = `
    for (x in "hello") {
      print(x + 1)
    }
  `;
  expect(() => check(code)).toThrow();
});

it("has while loops", () => {
  const code = `
    let x = 10
    while (x > 10) {
      print(x)
    } 
  `;
  expect(check(code)).toBe(true);
});

it("rejects while loops with non-boolean predicates", () => {
  const code = `
    while ("hello") {
      print(x)
    } 
  `;
  expect(() => check(code)).toThrow();
});

it("has trait constraints on type parameters", () => {
  const code = `
    func double <T : Num> (arg: T): T {
      arg + arg
    }
    double(1) + 1
    double(1.0) + 1.0
  `;
  expect(check(code)).toBe(true);
});

it("rejects func calls with invalid traits", () => {
  const code = `
    func double <T : Num> (arg: T): T {
      arg + arg
    }
    double("hello")
  `;
  expect(() => check(code)).toThrow();
});

it("does trait-like things using structs as impls", () => {
  const code = `
    struct MonoidTrait <Self> {
      zero: Self,
      concat: func (Self, Self): Self,
    }

    let sum_int: MonoidTrait<Int> = MonoidTrait {
      zero: 0,
      concat: |left, right| left + right,
    }

    let product_int: MonoidTrait<Int> = MonoidTrait {
      zero: 1,
      concat: |left, right| left * right,
    }

    func fold_m <T>(items: List<T>, trait_obj: MonoidTrait<T>): T {
      match (items) {
        Nil => trait_obj:zero,
        Cons(h, t) => trait_obj:concat(h, t.fold_m(trait_obj)),
      }
    }

    let sum = [1,2,3,4,5].fold_m(sum_int)
    let product = [1,2,3,4,5].fold_m(product_int)
  `;
  expect(check(code)).toBe(true);
});
