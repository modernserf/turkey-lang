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
