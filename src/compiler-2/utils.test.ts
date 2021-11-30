import {
  builtIn_,
  call_,
  func_,
  if_,
  let_,
  PrettyPrinter,
  program_,
  return_,
} from "./utils";

it("prints a program", () => {
  const modZero = Symbol("mod_zero");
  const l = Symbol("l");
  const r = Symbol("r");

  const fizzbuzz = Symbol("fizzbuzz");
  const from = Symbol("from");
  const to = Symbol("to");
  const program = program_([
    let_(
      modZero,
      func_([], [l, r], [return_(builtIn_("eq", [builtIn_("mod", [l, r]), 0]))])
    ),
    let_(
      fizzbuzz,
      func_(
        [fizzbuzz],
        [from, to],
        [
          if_(
            [
              [builtIn_("lt", [to, from]), [return_(null)]],
              [
                call_(modZero, [from, 15], true),
                [builtIn_("print_string", ["FizzBuzz"])],
              ],
              [
                call_(modZero, [from, 5], true),
                [builtIn_("print_string", ["Buzz"])],
              ],
              [
                call_(modZero, [from, 3], true),
                [builtIn_("print_string", ["Fizz"])],
              ],
            ],
            [builtIn_("print_num", [from])]
          ),
          call_(fizzbuzz, [builtIn_("add", [from, 1]), to], false),
        ]
      )
    ),
    call_(fizzbuzz, [1, 100], false),
  ]);
  expect(new PrettyPrinter().program(program)).toEqual(`
let mod_zero = func (l, r)  {
  return eq(mod(l, r), 0)
}
let fizzbuzz = func (from, to) with fizzbuzz = fizzbuzz {
  if (lt(to, from)) {
    return
  } else if (mod_zero(from, 15)) {
    print_string("FizzBuzz")
  } else if (mod_zero(from, 5)) {
    print_string("Buzz")
  } else if (mod_zero(from, 3)) {
    print_string("Fizz")
  } else {
    print_num(from)
  }
  fizzbuzz(add(from, 1), to)
}
fizzbuzz(1, 100)
`);
});
