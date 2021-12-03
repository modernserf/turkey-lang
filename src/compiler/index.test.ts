import { compile } from "./index";
import {
  builtIn_,
  call_,
  func_,
  if_,
  let_,
  program_,
  recur_,
  return_,
} from "../ir";
import { interpret } from "../interpreter";

it("runs a program", () => {
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
        [modZero],
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
          call_(recur_, [builtIn_("add", [from, 1]), to], false),
        ]
      )
    ),
    call_(fizzbuzz, [1, 100], false),
  ]);

  const compiled = compile(program);
  expect(interpret(compiled)).toMatchInlineSnapshot(`
Array [
  1,
  2,
  "Fizz",
  4,
  "Buzz",
  "Fizz",
  7,
  8,
  "Fizz",
  "Buzz",
  11,
  "Fizz",
  13,
  14,
  "FizzBuzz",
  16,
  17,
  "Fizz",
  19,
  "Buzz",
  "Fizz",
  22,
  23,
  "Fizz",
  "Buzz",
  26,
  "Fizz",
  28,
  29,
  "FizzBuzz",
  31,
  32,
  "Fizz",
  34,
  "Buzz",
  "Fizz",
  37,
  38,
  "Fizz",
  "Buzz",
  41,
  "Fizz",
  43,
  44,
  "FizzBuzz",
  46,
  47,
  "Fizz",
  49,
  "Buzz",
  "Fizz",
  52,
  53,
  "Fizz",
  "Buzz",
  56,
  "Fizz",
  58,
  59,
  "FizzBuzz",
  61,
  62,
  "Fizz",
  64,
  "Buzz",
  "Fizz",
  67,
  68,
  "Fizz",
  "Buzz",
  71,
  "Fizz",
  73,
  74,
  "FizzBuzz",
  76,
  77,
  "Fizz",
  79,
  "Buzz",
  "Fizz",
  82,
  83,
  "Fizz",
  "Buzz",
  86,
  "Fizz",
  88,
  89,
  "FizzBuzz",
  91,
  92,
  "Fizz",
  94,
  "Buzz",
  "Fizz",
  97,
  98,
  "Fizz",
  "Buzz",
]
`);
});
