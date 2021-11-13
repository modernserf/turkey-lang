import { compile } from "./compiler";
import { Expr, Opcode } from "./types";

it("compiles print statements, ints", () => {
  const result = compile([
    { tag: "print", expr: { tag: "integer", value: 1 } },
    { tag: "print", expr: { tag: "integer", value: 32768 } },
    { tag: "print", expr: { tag: "float", value: 0.1 } },
  ]);
});

it("resizes the buffer", () => {
  const size = 100;
  const result = compile(
    Array(size)
      .fill(null)
      .map(() => ({ tag: "print", expr: { tag: "integer", value: 1 } }))
  );
});

it("drops exprs evaluated for side effects", () => {
  const result = compile([
    { tag: "expr", expr: { tag: "integer", value: 1 } },
    { tag: "print", expr: { tag: "integer", value: 1 } },
  ]);
});

it("compiles let statements, do blocks, identifiers", () => {
  const result = compile([
    {
      tag: "print",
      expr: {
        tag: "do",
        block: [
          {
            tag: "let",
            binding: { tag: "identifier", value: "x" },
            type: null,
            expr: { tag: "integer", value: 1 },
          },
          { tag: "expr", expr: { tag: "identifier", value: "x" } },
        ],
      },
    },
  ]);
});

it("rejects undefined variables", () => {
  expect(() => {
    compile([{ tag: "expr", expr: { tag: "identifier", value: "x" } }]);
  }).toThrow();
});

it("rejects redefined variables", () => {
  expect(() => {
    compile([
      {
        tag: "let",
        binding: { tag: "identifier", value: "x" },
        type: null,
        expr: { tag: "integer", value: 1 },
      },
      {
        tag: "let",
        binding: { tag: "identifier", value: "x" },
        type: null,
        expr: { tag: "integer", value: 1 },
      },
    ]);
  }).toThrow();
});

it("accepts shadowed variables", () => {
  expect(() => {
    compile([
      {
        tag: "let",
        binding: { tag: "identifier", value: "x" },
        type: null,
        expr: { tag: "integer", value: 1 },
      },
      {
        tag: "expr",
        expr: {
          tag: "do",
          block: [
            {
              tag: "let",
              binding: { tag: "identifier", value: "x" },
              type: null,
              expr: { tag: "integer", value: 1 },
            },
          ],
        },
      },
    ]);
  }).not.toThrow();
});

it("compiles binary op expressions", () => {
  const result = compile([
    {
      tag: "print",
      expr: {
        tag: "binaryOp",
        operator: "+",
        left: { tag: "integer", value: 1 },
        right: { tag: "integer", value: 2 },
      },
    },
  ]);
});

it("typechecks arithmetic", () => {
  expect(() => {
    compile([
      {
        tag: "print",
        expr: {
          tag: "binaryOp",
          operator: "+",
          left: { tag: "float", value: 0.1 },
          right: { tag: "float", value: 0.2 },
        },
      },
    ]);
  }).not.toThrow();

  expect(() => {
    compile([
      {
        tag: "print",
        expr: {
          tag: "binaryOp",
          operator: "+",
          left: { tag: "integer", value: 1 },
          right: { tag: "float", value: 0.2 },
        },
      },
    ]);
  }).toThrow();
  expect(() => {
    compile([
      {
        tag: "print",
        expr: {
          tag: "binaryOp",
          operator: "+",
          left: { tag: "do", block: [] },
          right: { tag: "do", block: [] },
        },
      },
    ]);
  }).toThrow();
});

it("compiles expressions", () => {
  const op = (left: number, operator: string, right: Expr): Expr => ({
    tag: "binaryOp",
    operator,
    left: { tag: "integer", value: left },
    right: right,
  });

  const result = compile([
    {
      tag: "print",
      expr: op(
        6,
        "/",
        op(5, "+", op(4, "-", op(3, "*", { tag: "integer", value: 2 })))
      ),
    },
  ]);
});

it("compiles bools", () => {
  const result = compile([
    { tag: "print", expr: { tag: "typeConstructor", value: "True" } },
    { tag: "print", expr: { tag: "typeConstructor", value: "False" } },
  ]);
});

it("compiles conditionals", () => {
  const result = compile([
    {
      tag: "print",
      expr: {
        tag: "if",
        cases: [
          {
            tag: "cond",
            predicate: { tag: "typeConstructor", value: "True" },
            block: [{ tag: "expr", expr: { tag: "integer", value: 1 } }],
          },
        ],
        elseBlock: [{ tag: "expr", expr: { tag: "integer", value: 2 } }],
      },
    },
  ]);
});

it("compiles while loops", () => {
  const result = compile([
    {
      tag: "while",
      expr: { tag: "typeConstructor", value: "True" },
      block: [
        {
          tag: "print",
          expr: { tag: "integer", value: 0 },
        },
      ],
    },
  ]);
});
