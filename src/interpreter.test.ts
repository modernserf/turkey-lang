import { interpret } from "./interpreter";
import { Assembler } from "./assembler";

it("runs fizzbuzz", () => {
  // prettier-ignore
  const fizzbuzz = new Assembler()
    .number(0).initLocal("i")
    .label('loop')
      .local('i').number(100).sub().jumpIfZero('end')
      .local('i').number(1).add().setLocal('i')
      .local('i').number(15).mod().jumpIfZero('print_fizzbuzz')
      .local('i').number(3).mod().jumpIfZero('print_fizz')
      .local('i').number(5).mod().jumpIfZero('print_buzz')
      .local('i').print()
      .jump('loop')
    .label('print_fizzbuzz')
      .string('FizzBuzz').print().jump('loop')
    .label('print_fizz')
      .string('Fizz').print().jump('loop')
    .label('print_buzz')
      .string('Buzz').print().jump('loop')
    .label('end')
      .halt()
    .assemble()

  expect(interpret(fizzbuzz)).toMatchInlineSnapshot(`
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

it("runs fibonacci imperatively", () => {
  // prettier-ignore
  const fibonacci = new Assembler()
    .number(20).initLocal('i')
    .number(0).initLocal('a')
    .number(1).initLocal('b')
    .label('loop')
      .scope()
      .local('i').jumpIfZero('end')
      .local('i').number(1).sub().setLocal('i')
      .local('b').initLocal('swap')
      .local('b').local('a').add().setLocal('b')
      .local('swap').setLocal('a')
      .endScopeVoid()
      .jump('loop')
    .label('end')
      .local('a').print()
      .halt()
    .assemble()

  expect(interpret(fibonacci)).toEqual(["6765"]);
});

it("runs fibonnaci recursively (without TCO)", () => {
  // prettier-ignore
  const fibonacci = new Assembler()
    .number(20).call('fib', 1).print()
    .halt()
    
    .func('fib', 'i')
      .local('i').number(0).number(1).call('fib_inner', 3).return()
    .endfunc()

    .func('fib_inner', 'i', 'a', 'b')
      .local('i').jumpIfZero('return_a')
      .local('i').number(1).sub().jumpIfZero('return_b')
      
      .local('i').number(1).sub()
      .local('b')
      .local('b').local('a').add()
      .call('fib_inner', 3).return()

      .label('return_a').local('a').return()
      .label('return_b').local('b').return()
    .endfunc()
    .assemble()

  expect(interpret(fibonacci)).toEqual(["6765"]);
});

it("works with objects in the heap", () => {
  // prettier-ignore
  const sum = new Assembler()
    .newObject(6).initLocal('arr') // note: const array, 0: size, values are 1-indexed
    .local('arr').number(5).setHeap(0)
    .local('arr').number(1).setHeap(1)
    .local('arr').number(2).setHeap(2)
    .local('arr').number(3).setHeap(3)
    .local('arr').number(4).setHeap(4)
    .local('arr').number(5).setHeap(5)
    .local('arr').call('sum', 1).print().halt()

    .func('sum', 'arr')
      .number(0).initLocal('acc')
      .local('arr').getHeap(0).initLocal('i')
      .label('loop')
        .local('i').jumpIfZero('end')
        .local('arr').local('i').add().getHeap(0)
        .local('acc')
        .add()
        .setLocal('acc')
        .local('i').number(1).sub().setLocal('i')
        .jump('loop')
      .label('end')
        .local('acc').return()
    .endfunc()
    .assemble()

  expect(interpret(sum)).toEqual(["15"]);
});

it("works with closures", () => {
  // prettier-ignore
  const adder = new Assembler()
    .call('getAdder', 0).initLocal('adder')
    .number(1).local('adder').callClosure(1).print()
    .number(2).local('adder').callClosure(1).print()
    .number(3).local('adder').callClosure(1).print()
    .halt()

    .func('getAdder')
      .newObject(1).initLocal('state')
      .local('state').number(0).setHeap(0)
      .newClosure('adderClosure', 'state').return()
    .endfunc()

    .closure('adderClosure', ['add'], ['state'])
      .closureValue('state').getHeap(0).initLocal('value')
      .local('value').local('add').add().setLocal('value')
      .closureValue('state').local('value').setHeap(0)
      .local('value').return()
    .endfunc()

    .assemble()

  expect(interpret(adder)).toEqual(["1", "3", "6"]);
});

it("enforces balanced scope", () => {
  expect(() => {
    // prettier-ignore
    new Assembler()
      .scope()
      .endScopeVoid()
      .endScopeVoid()
      .assemble()
  }).toThrow();
});

it("enforces a single level of functions", () => {
  expect(() => {
    // prettier-ignore
    new Assembler()
      .func('foo')
      .func('bar')
      .assemble()
  }).toThrow();
  expect(() => {
    // prettier-ignore
    new Assembler()
      .func('foo')
      .endfunc()
      .endfunc()
      .assemble()
  }).toThrow();
});

it("enforces function arity", () => {
  expect(() => {
    // prettier-ignore
    new Assembler()
      .number(1).number(2).call('foo', 2)
      .halt()
      .func('foo', 'arg')
      .endfunc()
      .assemble()
  }).toThrow();
});

it("interns strings", () => {
  // prettier-ignore
  const program = new Assembler()
    .string("foo").print()
    .string("foo").print()
    .halt()
    .assemble()

  expect(interpret(program)).toEqual(["foo", "foo"]);
});

it("rejects out-of-bounds heap access", () => {
  expect(() => {
    // prettier-ignore
    const program = new Assembler()
      .getHeap(100)
      .halt()
      .assemble()

    interpret(program);
  }).toThrow();
  expect(() => {
    // prettier-ignore
    const program = new Assembler()
      .newObject(1).number(2).setHeap(100)
      .halt()
      .assemble()

    interpret(program);
  }).toThrow();
});

it("rejects memory access on heap headers", () => {
  // prettier-ignore
  const program = new Assembler()
    .newObject(1).getHeap(-1)
    .halt()
    .assemble()

  expect(() => interpret(program)).toThrow();
});
