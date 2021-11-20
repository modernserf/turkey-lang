import run from "./index";

it("evaluates an empty program", () => {
  expect(run("")).toEqual([]);
});

it("prints", () => {
  const code = `
    print(123.45) // a number
    print(0)      // another one
    print(6789)   // the last number
  `;
  expect(run(code)).toEqual(["123.45", "0", "6789"]);
});

it("adds", () => {
  expect(run(`print(123456 + 1)`)).toEqual(["123457"]);
  expect(run(`print(1.5 + -2.0)`)).toEqual(["-0.5"]);
});

it("typechecks math", () => {
  expect(() => {
    run(`print(1.5 + 2)`);
  }).toThrow();
});

it("references variables", () => {
  const code = `
    let x = 1
    let y : Int = 2 + 3
    x - y
    print(x + y + 4)
  `;
  expect(run(code)).toEqual(["10"]);
});

it("uses do blocks", () => {
  const code = `
    let res = do {
      let x = 1
      let y = 2
      print(x)
      print(y)
      x + y
    }
    print(res)
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
    print(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("enforces type matching between conditional branches", () => {
  const code = `
    let x = if (True) {
      1
    } else {
      1.0
    }
    print(x)
  `;

  expect(() => run(code)).toThrow();
});

it("uses conditional statements", () => {
  const code = `
    if (True) {
      print(1)
    }
    print(2)
  `;
  expect(run(code)).toEqual(["1", "2"]);
});

it("theoretically uses loops", () => {
  const code = `
    while (!True) {
      print(1)
    }
    while (!!False) {
      3
    }
    print(2)
  `;
  expect(run(code)).toEqual(["2"]);
});

it("drops expressions called for their side effects", () => {
  const code = `
    let x = 1
    x + 2
    print(x + 3)
  `;
  expect(run(code)).toEqual(["4"]);
});

it("calls functions", () => {
  const code = `
    func print_twice (x: Int): Void {
      print(x)
      print(x)
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

    print(get_x())
  `;

  expect(run(code)).toEqual(["1.5"]);
});

it("forbids returning from top level", () => {
  const code = `
    return 1
  `;
  expect(() => run(code)).toThrow();
});

it("forbids unknown types", () => {
  const code = `
    func get_x (): Nope {
      return 1
    }
  `;
  expect(() => run(code)).toThrow();
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
      print(val)
      print(val)
    }

    print_twice("hello")
  `;

  expect(run(code)).toEqual(["hello", "hello"]);
});

it("supports recursion", () => {
  const code = `
    func count (from: Int): Void {
      print(from)
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
        print("FizzBuzz")
      } else if (from % 3 == 0) {
        print("Fizz")
      } else if (from % 5 == 0) {
        print("Buzz")
      } else {
        print(from)
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
      print(x)
    } else {
      print(0)
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
    print(map(10, double))
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

    print(add_curried(1)(2))
  `;

  expect(run(code)).toEqual(["3"]);
});

it("rejects invalid function types", () => {
  const code = `
    func foo (x: Int): Void {}
    let bar: func (Int, Int): Void = foo
  `;
  expect(() => run(code)).toThrow();
});

it("has anonymous function literals", () => {
  const code = `
    func map (value: Int, fn: func (Int): Int): Int {
      fn(value)
    }
    print(map(10, |x| { x + x }))
  `;

  expect(run(code)).toEqual(["20"]);
});

it("rejects anonymous functions without inferred types", () => {
  const code = `
    let fn = |x| { x + x }
    print(fn(1))
  `;
  expect(() => run(code)).toThrow();
});

it("rejects anonymous functions type mismatches", () => {
  const code = `
    func map (value: Int, fn: func (Int): Int): Int {

      fn(value)
    }
    print(map(10, |x, y| { x + y }))
  `;
  expect(() => run(code)).toThrow();
});

it("has type aliases", () => {
  const code = `
    type Mapper = func (Int): Int
    let fn: Mapper = |x| { x + x }
    print(fn(1))
  `;

  expect(run(code)).toEqual(["2"]);
});

it("has simple enums", () => {
  const code = `
    enum Version { V1, V2 }
    func print_version(v: Version): Void {
      if (v == V1) {
        print("V1")
      } else {
        print("V2")
      }
    }
    print_version(V2)
  `;
  expect(run(code)).toEqual(["V2"]);
});

it("rejects duplicate tags in enums", () => {
  const code = `
    enum Version { V1, V1 }
  `;
  expect(() => run(code)).toThrow();
});

it("rejects enun type mismatches", () => {
  const code = `
    enum Foo { Foo }
    enum Bar { Bar }
    func foo(value: Foo): Void {}

    foo(Bar)
  `;
  expect(() => run(code)).toThrow();
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

    print(manhattan_distance(Point { x: 1, y: 1 }, Point { x: 2, y: 0 }))
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
    print(point:x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("rejects duplicate fields in struct definitions", () => {
  const code = `
    struct Point { x: Int, x: Int }
  `;
  expect(() => run(code)).toThrow();
});

it("rejects duplicate fields in struct constructors", () => {
  const code = `
    struct Val { x: Int }
    let val = Val { x: 1, x: 2 }
  `;
  expect(() => run(code)).toThrow();
});

it("rejects missing fields in struct constructors", () => {
  const code = `
    struct Point { x: Int, y: Int }
    let point = Point { x: 1 }
  `;
  expect(() => run(code)).toThrow();
});

it("rejects unknown fields in struct constructors", () => {
  const code = `
    struct Point { x: Int, y: Int }
    let point = Point { x: 1, y: 1, z: 2 }
  `;
  expect(() => run(code)).toThrow();
});

it("rejects field access on non-structs", () => {
  expect(() => run(`"foo":0`)).toThrow();
});

it("rejects invalid field access ", () => {
  const code = `
    struct Point { x: Int, y: Int }
    let point = Point { x: 1, y: 1 }
    print(point:z)
  `;
  expect(() => run(code)).toThrow();
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

    print(manhattan_distance(Point(1,1), Point(2,0)))
  `;
  expect(run(code)).toEqual(["2"]);
});

it("has destructuring", () => {
  const code = `
  struct Point {
    x: Int,
    y: Int,
  }

  let point = Point { x: 1, y: 2 }
  let { x: x } = point
  print(x)
  `;
  expect(run(code)).toEqual(["1"]);
});

it("rejects destructuring of non-structs", () => {
  const code = `
    let { x, y } = 1
  `;
  expect(() => run(code)).toThrow();
});

it("puns struct fields in destructuring", () => {
  const code = `
    struct Point {
      x: Int,
      y: Int,
    }

    let point = Point { x: 1, y: 2 }
    let { x } = point
    print(x)
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

    print(get_x(Point { x: 1, y: 2 }))
  `;
  expect(run(code)).toEqual(["1"]);
});

// it("has pattern matching", () => {
//   const code = `
//     enum V { V1, V2 }

//     match (V1) {
//       V1 => {
//         print(1)
//       },
//       V2 => {
//         print(2)
//       }
//     }
//   `;
//   expect(run(code)).toEqual(["1"]);
// });

// it("rejects pattern matching on non-enums", () => {
//   const code = `
//     match ("hello") {
//       True => {
//         print("hello")
//       },
//       False => {
//         print("goodbye")
//       }
//     }
//   `;
//   expect(() => run(code)).toThrow();
// });

// it("rejects incomplete cases", () => {
//   const code = `
//     match (True) {
//       True => {
//         print("hello")
//       },
//     }
//   `;
//   expect(() => run(code)).toThrow();
// });

// it("rejects duplicate cases", () => {
//   const code = `
//     match (True) {
//       True => {
//         print("hello")
//       },
//       True => {
//         print("hello")
//       },
//       False => {
//         print("goodbye")
//       },
//     }
//   `;
//   expect(() => run(code)).toThrow();
// });

// it("rejects invalid branches", () => {
//   const code = `
//     match (True) {
//       True => {
//         print("hello")
//       },
//       False => {
//         print("goodbye")
//       },
//       Other => {
//         print("hmmm")
//       },
//     }
//   `;
//   expect(() => run(code)).toThrow();
// });

// it("has tagged variants", () => {
//   const code = `
//     enum IntOption {
//       None,
//       Some(Int),
//     }

//     func print_int_option(val: IntOption): Void {
//       match (val) {
//         None => {
//           print("None")
//         },
//         Some(x) => {
//           print("Some")
//         },
//       }
//     }

//     print_int_option(None)
//     print_int_option(Some(5))
//   `;
//   expect(run(code)).toEqual(["None", "Some"]);
// });

// it("destructures tagged variant values", () => {
//   const code = `
//     enum IntOption {
//       None,
//       Some(Int),
//     }

//     func print_int_option(val: IntOption): Void {
//       match (val) {
//         None => {
//           print("None")
//         },
//         Some(x) => {
//           print(x)
//         },
//       }
//     }

//     print_int_option(None)
//     print_int_option(Some(5))
//   `;
//   expect(run(code)).toEqual(["None", "5"]);
// });

// it("has recursive types", () => {
//   const code = `
//     enum IntList {
//       Nil,
//       Cons(Int, IntList),
//     }

//     func foldl (
//       list: IntList,
//       acc: Int,
//       fn: func (Int, Int): Int
//     ): Int {
//       match (list) {
//         Cons(h, t) => foldl(t, fn(acc, h), fn),
//         Nil => acc,
//       }
//     }

//     let list = Cons(1, Cons(2, Cons(3, Nil)))
//     let sum  = foldl(list, 0, |acc, value| { acc + value })
//     print(sum)
//   `;
//   expect(run(code)).toEqual(["6"]);
// });

// it("has generic function params", () => {
//   const code = `
//     func id<T> (value: T): T {
//       value
//     }

//     print(id(1))
//     print(id("hello"))
//   `;
//   expect(run(code)).toEqual(["1", "hello"]);
// });

// it("has generic struct params", () => {
//   const code = `
//     struct Cell <T> {
//       current: T
//     }

//     let x = Cell { current: 1 }
//     let y = Cell { current: "hello" }

//     print(x:current)
//     print(y:current)
//   `;
//   expect(run(code)).toEqual(["1", "hello"]);
// });

// it("propagates generic args", () => {
//   const code = `
//     struct Cell<T> {
//       current: T
//     }

//     func current<T> (cell: Cell<T>): T {
//       cell:current
//     }

//     let x = current(Cell { current: 1 })
//     print(x)
//   `;
//   expect(run(code)).toEqual(["ok", "1"]);
// });

// it("has generic enum params", () => {
//   const code = `
//     enum List<T> {
//       Nil,
//       Cons(T, List<T>),
//     }

//     func length<T>(list: List<T>): Int {
//       match (list) {
//         Nil => 0,
//         Cons(h, t) => 1 + length(t),
//       }
//     }

//     let list1 = Cons(1, Cons(2, Cons(3, Nil)))
//     let list2 = Cons("foo", Cons("bar", Nil))
//     print(length(list1))
//     print(length(list2))
//   `;
//   expect(run(code)).toEqual(["3", "2"]);
// });

// it("unifies types across if branches", () => {
//   const code = `
//     enum Either<L, R> {
//       Left(L),
//       Right(R),
//     }

//     let res = if (True) {
//       Left(1)
//     } else {
//       Right("foo")
//     }

//     match (res) {
//       Left(x) => print("left"),
//       Right(x) => print("right"),
//     }
//   `;
//   expect(run(code)).toEqual(["left"]);
// });

// it("allows unbound & unused type parameters", () => {
//   const code = `
//     enum Either<L, R> {
//       Left(L),
//       Right(R),
//     }

//     let res = Left(1)

//     func print_left_int<T>(x: Either<Int, T>): Void {
//       match (res) {
//         Left(x) => {
//           print("left")
//         },
//         Right(x) => {},
//       }
//     }

//     print_left_int(res)
// `;

//   expect(run(code)).toEqual(["left"]);
// });

// it("has method syntax", () => {
//   const code = `
//     enum List<T> {
//       Nil,
//       Cons(T, List<T>),
//     }

//     func foldl<Item, Acc> (
//       list: List<Item>,
//       acc: Acc,
//       fn: func (Acc, Item): Acc
//     ): Acc {
//       match (list) {
//         Cons(h, t) => t.foldl(fn(acc, h), fn),
//         Nil => acc,
//       }
//     }

//     let list = Cons(1, Cons(2, Cons(3, Nil)))
//     let sum = list.foldl(0, |acc, value| { acc + value })
//     print(sum)
//   `;
//   expect(run(code)).toEqual(["6"]);
// });

// it("has methods without arguments", () => {
//   const code = `"foo".print`;
//   expect(run(code)).toEqual(["foo"]);
// });

// it("has tuple literals", () => {
//   const code = `
//     let (x, y) = (1, "foo")
//     print(x)
//     print(y)
//   `;
//   expect(run(code)).toEqual(["1", "foo"]);
// });

// it("has tuple type literals", () => {
//   const code = `
//     let pair: (Int, String) = (1, "foo")
//     print(pair:0)
//     print(pair:1)
//   `;
//   expect(run(code)).toEqual(["1", "foo"]);
// });
