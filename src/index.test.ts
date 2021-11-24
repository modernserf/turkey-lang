import run from "./index";

it("evaluates an empty program", () => {
  expect(run("")).toEqual([]);
});

it("prints", () => {
  const code = `
    print_float(123.45) // a number
    print_int(0)      // another one
    print_int(6789)   // the last number
  `;
  expect(run(code)).toEqual(["123.45", "0", "6789"]);
});

it("adds", () => {
  expect(run(`print_int(123456 + 1)`)).toEqual(["123457"]);
  expect(run(`print_float(1.5 + -2.0)`)).toEqual(["-0.5"]);
});

it("references variables", () => {
  const code = `
    let x = 1
    let y : Int = 2 + 3
    x - y
    print_int(x + y + 4)
  `;
  expect(run(code)).toEqual(["10"]);
});

it("uses do blocks", () => {
  const code = `
    let res = do {
      let x = 1
      let y = 2
      print_int(x)
      print_int(y)
      x + y
    }
    print_int(res)
  `;
  expect(run(code)).toEqual(["1", "2", "3"]);
});

it("uses conditionals", () => {
  const code = `
    let x = if (True) {
      let result = 1
      let ignored = 2
      result
    } else {
      2
    }
    print_int(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("uses conditional statements", () => {
  const code = `
    if (True) {
      print_int(1)
    }
    print_int(2)
  `;
  expect(run(code)).toEqual(["1", "2"]);
});

// it("theoretically uses loops", () => {
//   const code = `
//     while (!True) {
//       print_int(1)
//     }
//     func forever (): Void {
//       while (!False) {
//         3
//       }
//     }
//     print_int(2)
//   `;
//   expect(run(code)).toEqual(["2"]);
// });

it("drops expressions called for their side effects", () => {
  const code = `
    let x = 1
    x + 2
    print_int(x + 3)
  `;
  expect(run(code)).toEqual(["4"]);
});

it("calls functions", () => {
  const code = `
    func print_twice (x: Int): Void {
      print_int(x)
      print_int(x)
      return
    }

    print_twice(2)
  `;
  expect(run(code)).toEqual(["2", "2"]);
});

it("calls closures", () => {
  const code = `
    let x = 1.5
    func get_x (): Float {
      return x
    }

    print_float(get_x())
  `;

  expect(run(code)).toEqual(["1.5"]);
});

it("calls nested closures", () => {
  const code = `
    let x = 1.5
    func get_get_x (): func (): Float {
      func get_x(): Float {
        x
      }
      return get_x
    }

    print_float(get_get_x()())
  `;
  expect(run(code)).toEqual(["1.5"]);
});

it("treats void as a value", () => {
  const code = `
    let x: Void = do {}
  `;
  expect(run(code)).toEqual([]);
});

it("uses strings", () => {
  const code = `
    func print_twice (val: String): Void {
      print_string(val)
      print_string(val)
    }

    print_twice("hello")
    print_twice("hello")
  `;

  expect(run(code)).toEqual(["hello", "hello", "hello", "hello"]);
});

it("supports recursion", () => {
  const code = `
    func count (from: Int): Void {
      print_int(from)
      if (from > 0) {
        count(from - 1)
      }
    }
    count(10)
  `;
  expect(run(code)).toMatchInlineSnapshot(`
Array [
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
  "1",
  "0",
]
`);
});

it("runs fizzbuzz", () => {
  const code = `
    func fizzbuzz (from: Int, to: Int): Void {
      if (from > to) { return }

      if (from % 15 == 0) {
        print_string("FizzBuzz")
      } else if (from % 3 == 0) {
        print_string("Fizz")
      } else if (from % 5 == 0) {
        print_string("Buzz")
      } else {
        print_int(from)
      }

      fizzbuzz(from + 1, to)
    }
    fizzbuzz(1, 100)
  `;
  expect(run(code)).toMatchInlineSnapshot(`
Array [
  "1",
  "2",
  "Fizz",
  "4",
  "Buzz",
  "Fizz",
  "7",
  "8",
  "Fizz",
  "Buzz",
  "11",
  "Fizz",
  "13",
  "14",
  "FizzBuzz",
  "16",
  "17",
  "Fizz",
  "19",
  "Buzz",
  "Fizz",
  "22",
  "23",
  "Fizz",
  "Buzz",
  "26",
  "Fizz",
  "28",
  "29",
  "FizzBuzz",
  "31",
  "32",
  "Fizz",
  "34",
  "Buzz",
  "Fizz",
  "37",
  "38",
  "Fizz",
  "Buzz",
  "41",
  "Fizz",
  "43",
  "44",
  "FizzBuzz",
  "46",
  "47",
  "Fizz",
  "49",
  "Buzz",
  "Fizz",
  "52",
  "53",
  "Fizz",
  "Buzz",
  "56",
  "Fizz",
  "58",
  "59",
  "FizzBuzz",
  "61",
  "62",
  "Fizz",
  "64",
  "Buzz",
  "Fizz",
  "67",
  "68",
  "Fizz",
  "Buzz",
  "71",
  "Fizz",
  "73",
  "74",
  "FizzBuzz",
  "76",
  "77",
  "Fizz",
  "79",
  "Buzz",
  "Fizz",
  "82",
  "83",
  "Fizz",
  "Buzz",
  "86",
  "Fizz",
  "88",
  "89",
  "FizzBuzz",
  "91",
  "92",
  "Fizz",
  "94",
  "Buzz",
  "Fizz",
  "97",
  "98",
  "Fizz",
  "Buzz",
]
`);
});

it("handles dropping scope values correctly", () => {
  const code = `
    func get_three(): Int { 3 }

    if (True) {
      let x = get_three()
      get_three()
      print_int(x)
    } else {
      print_int(0)
    }
  `;
  expect(run(code)).toEqual(["3"]);
});

it("accepts functions as parameters", () => {
  const code = `
    func map (value: Int, fn: func (Int): Int): Int {
      fn(value)
    }
    func double (value: Int): Int {
      return value + value
    }
    print_int(map(10, double))
  `;

  expect(run(code)).toEqual(["20"]);
});

it("accepts functions as return values", () => {
  const code = `
    func add_curried (left: Int): func (Int): Int {
      func add_right(right: Int): Int {
        return left + right
      }
      return add_right
    }

    print_int(add_curried(1)(2))
  `;

  expect(run(code)).toEqual(["3"]);
});

it("has anonymous function literals", () => {
  const code = `
    func map (value: Int, fn: func (Int): Int): Int {
      fn(value)
    }
    print_int(map(10, |x| { x + x }))
  `;

  expect(run(code)).toEqual(["20"]);
});

it("has type aliases", () => {
  const code = `
    type Mapper = func (Int): Int
    let fn: Mapper = |x| { x + x }
    print_int(fn(1))
  `;

  expect(run(code)).toEqual(["2"]);
});

it("has pattern matching", () => {
  const code = `
    enum V { V1, V2 }

    match (V1) {
      V1 => {
        print_int(1)
      },
      V2 => {
        print_int(2)
      }
    }
  `;
  expect(run(code)).toEqual(["1"]);
});

it("has structs", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,
    }

    func abs (x: Int): Int {
      if (x > 0) { x } else { -x }
    }

    func manhattan_distance (from: Point, to: Point): Int {
      abs(to:x - from:x) + abs(to:y - from:y)
    }

    print_int(manhattan_distance(Point { x: 1, y: 1 }, Point { x: 2, y: 0 }))
  `;
  expect(run(code)).toEqual(["2"]);
});

it("puns struct fields in construction", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,
    }

    let x = 1
    let y = 2
    let point = Point { x, y }
    print_int(point:x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("has destructuring", () => {
  const code = `
  struct Point {
    x: Int,
    y: Int,
  }

  let point = Point { x: 1, y: 2 }
  let { x: x } = point
  print_int(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("puns struct fields in destructuring", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,
    }

    let point = Point { x: 1, y: 2 }
    let { x } = point
    print_int(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("destructures function parameters", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,
    }

    func get_x ({ x }: Point): Int {
      x
    }

    print_int(get_x(Point { x: 1, y: 2 }))
  `;
  expect(run(code)).toEqual(["1"]);
});

it("has tuple structs", () => {
  const code = `
    struct Point (Int, Int)

    func abs (x: Int): Int {
      if (x > 0) { x } else { -x }
    }

    func manhattan_distance (from: Point, to: Point): Int {
      abs(to:0 - from:0) + abs(to:1 - from:1)
    }

    print_int(manhattan_distance(Point(1,1), Point(2,0)))
  `;
  expect(run(code)).toEqual(["2"]);
});

it("destructures tuple structs", () => {
  const code = `
    struct Point (Int, Int)

    let (x, y) = Point(10,20)

    print_int(x + y)
  `;
  expect(run(code)).toEqual(["30"]);
});

it.skip("rejects incomplete tuple destructuring", () => {
  const code = `
    struct Point (Int, Int)

    let (x) = Point(10,20)

    print_int(x)
  `;
  expect(() => run(code)).toThrow();
});

it("has tagged variants", () => {
  const code = `
    enum IntOption {
      None,
      Some(Int),
    }

    func print_int_option(val: IntOption): Void {
      match (val) {
        None => {
          print_string("None")
        },
        Some(_) => {
          print_string("Some")
        },
      }
    }

    print_int_option(None)
    print_int_option(Some(5))
  `;
  expect(run(code)).toEqual(["None", "Some"]);
});

it("destructures tagged variant values", () => {
  const code = `
    enum IntOption {
      None,
      Some(Int),
    }

    func print_int_option(val: IntOption): Void {
      match (val) {
        None => {
          print_string("None")
        },
        Some(x) => {
          print_int(x)
        },
      }
    }

    print_int_option(None)
    print_int_option(Some(5))
  `;
  expect(run(code)).toEqual(["None", "5"]);
});

it("has recursive types", () => {
  const code = `
    enum IntList {
      Nil,
      Cons(Int, IntList),
    }

    func foldl (
      list: IntList,
      acc: Int,
      fn: func (Int, Int): Int
    ): Int {
      match (list) {
        Cons(h, t) => foldl(t, fn(acc, h), fn),
        Nil => acc,
      }
    }

    let list = Cons(1, Cons(2, Cons(3, Nil)))
    let sum  = foldl(list, 0, |acc, value| { acc + value })
    print_int(sum)
  `;
  expect(run(code)).toEqual(["6"]);
});

it("has generic function params", () => {
  const code = `
    func id<T> (value: T): T {
      value
    }

    print_int(id(1))
    print_string(id("hello"))
  `;
  expect(run(code)).toEqual(["1", "hello"]);
});

it("has generic struct params", () => {
  const code = `
    struct Cell <T> {
      current: T
    }

    let x = Cell { current: 1 }
    let y: Cell<String> = Cell { current: "hello" }

    print_int(x:current)
    print_string(y:current)
  `;
  expect(run(code)).toEqual(["1", "hello"]);
});

it("has parameterized type aliases", () => {
  const code = `
    struct Cell <T> {
      current: T
    }

    type CellAlias<T> = Cell<T>

    let x: CellAlias<Int> = Cell { current: 1 }

    print_int(x:current)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("destructures generic struct params", () => {
  const code = `
    struct Cell <T> {
      current: T
    }

    let { current } = Cell { current: "hello" }
    print_string(current)
  `;
  expect(run(code)).toEqual(["hello"]);
});

it("accepts concrete parameterized types in function bindings", () => {
  const code = `
    struct Cell<Value> {
      current: Value
    }

    func current (cell: Cell<Int>): Int {
      cell:current
    }

    let x = current(Cell { current: 1 })
    print_int(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("propagates generic args", () => {
  const code = `
    struct Cell<Value> {
      current: Value
    }

    func current<U> (cell: Cell<U>): Cell<U> {
      cell
    }

    let x = current(Cell { current: 1 })
    print_int(x:current)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("makes generic args concrete at call time", () => {
  const code = `
    struct Cell<Value> {
      current: Value
    }

    func current<U> (cell: Cell<U>): U {
      cell:current
    }

    let x = current(Cell { current: 1 })
    print_int(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("has generic enum params", () => {
  const code = `
    enum List<T> {
      Nil,
      Cons(T, List<T>),
    }

    func length<T>(list: List<T>): Int {
      match (list) {
        Nil => 0,
        Cons(h, t) => 1 + length(t),
      }
    }

    let list1 = Cons(1, Cons(2, Cons(3, Nil)))
    let list2 = Cons("foo", Cons("bar", Nil))
    print_int(length(list1))
    print_int(length(list2))
  `;
  expect(run(code)).toEqual(["3", "2"]);
});

it("unifies types across if branches", () => {
  const code = `
    enum Either<L, R> {
      Left(L),
      Right(R),
    }

    let res = if (True) {
      Left(1)
    } else {
      Right("foo")
    }

    match (res) {
      Left(x) => print_string("left"),
      Right(x) => print_string("right"),
    }
  `;
  expect(run(code)).toEqual(["left"]);
});

it("has method syntax", () => {
  const code = `
    enum List<T> {
      Nil,
      Cons(T, List<T>),
    }

    func foldl<Item, Acc> (
      list: List<Item>,
      acc: Acc,
      fn: func (Acc, Item): Acc
    ): Acc {
      match (list) {
        Cons(h, t) => t.foldl(fn(acc, h), fn),
        Nil => acc,
      }
    }

    func add (acc: Int, value: Int): Int {
      acc + value
    }

    let list: List<Int> = Cons(1, Cons(2, Cons(3, Nil)))
    let sum = list.foldl(0, add)
    print_int(sum)
  `;
  expect(run(code)).toEqual(["6"]);
});

it("has methods without arguments", () => {
  const code = `
    "foo".print_string
    "bar".print_string()
  `;
  expect(run(code)).toEqual(["foo", "bar"]);
});

it("has tuple literals", () => {
  const code = `
    let (x, y) = (1, "foo")
    print_int(x)
    print_string(y)
  `;
  expect(run(code)).toEqual(["1", "foo"]);
});

it("has tuple type literals", () => {
  const code = `
    let pair: (Int, String) = (1, "foo")
    print_int(pair:0)
    print_string(pair:1)
  `;
  expect(run(code)).toEqual(["1", "foo"]);
});

it.skip("rejects destructuring tuples with the wrong number of args", () => {
  const code = `
    let (x) = (1, "foo")
    print_int(x)
  `;
  expect(() => run(code)).toThrow();
});

it.skip("does not bind identifiers starting with underscore", () => {
  const code = `
    let _ = 1
    let _ = 2

    func foo (_arg: Int, _arg: Int): Void {}

    foo(1, 2)
  `;
  expect(run(code)).toEqual([]);
});

it.skip("cannot reference underscore identifiers", () => {
  const code = `
    let _ = 1
    print_int(_)
  `;
  expect(() => run(code)).toThrow();
});

it.skip("has list literals", () => {
  const code = `
    func foldl<Item, Acc> (
      list: List<Item>,
      acc: Acc,
      fn: func (Acc, Item): Acc
    ): Acc {
      match (list) {
        Cons(h, t) => t.foldl(fn(acc, h), fn),
        Nil => acc,
      }
    }

    func add (acc: Int, value: Int): Int {
      acc + value
    }

    let xs = [1, 2, 3]
    let ys = []

    print_int(xs.foldl(0, add))
    print_int(ys.foldl(0, add))
  `;
  expect(run(code)).toEqual(["6", "0"]);
});

it.skip("has for-in loops", () => {
  const code = `
    // TODO: why isn't list type inferred here?
    let list: List<Int> = [2, 4, 6]

    for (item in list) {
      print_int(item)
    }
  `;
  expect(run(code)).toEqual(["2", "4", "6"]);
});

it.skip("has mutable refs", () => {
  const code = `
    let counter = Ref(0)
    print_int(counter:0)
    counter.set(1)
    print_int(counter:0)
  `;
  expect(run(code)).toEqual(["0", "1"]);
});

it.skip("runs a while loop", () => {
  const code = `
    let counter = Ref(0)
    while(1 > counter:0) {
      // load bearing type signature
      let next: Int = counter:0
      counter.set(next + 1)
    }
  `;
  expect(run(code)).toMatchInlineSnapshot(`Array []`);
});
