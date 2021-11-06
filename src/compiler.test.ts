import { compile } from "./compiler";
import { Expr, Opcode } from "./types";

it("compiles print statements, ints", () => {
  const result = compile([
    { tag: "print", expr: { tag: "integer", value: 1 } },
    { tag: "print", expr: { tag: "integer", value: 32768 } },
    { tag: "print", expr: { tag: "float", value: 0.1 } },
  ]);
  expect(result.constants).toEqual([true, false, 32768, 0.1]);
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,
    Opcode.IntImmediate,
    1,
    Opcode.Print,
    Opcode.Constant,
    2,
    Opcode.Print,
    Opcode.Constant,
    3,
    Opcode.Print,
    Opcode.PopScopeVoid,
    Opcode.Halt,
  ]);
});

it("resizes the buffer", () => {
  const size = 100;
  const result = compile(
    Array(size)
      .fill(null)
      .map(() => ({ tag: "print", expr: { tag: "integer", value: 1 } }))
  );
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,
    ...Array(size)
      .fill(null)
      .flatMap(() => [Opcode.IntImmediate, 1, Opcode.Print]),
    Opcode.PopScopeVoid,
    Opcode.Halt,
  ]);
});

it("drops exprs evaluated for side effects", () => {
  const result = compile([
    { tag: "expr", expr: { tag: "integer", value: 1 } },
    { tag: "print", expr: { tag: "integer", value: 1 } },
  ]);
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,
    Opcode.IntImmediate,
    1,
    Opcode.Drop,
    Opcode.IntImmediate,
    1,
    Opcode.Print,
    Opcode.PopScopeVoid,
    Opcode.Halt,
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

  // prettier-ignore
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,       // [<frame>]
    Opcode.PushScope,       // [<frame>,<frame>]
    Opcode.IntImmediate, 1, // [<frame>,<frame>, 1]
    Opcode.InitLocal,       // [<frame>,<frame>, x = 1]
    Opcode.GetLocal, 2,     // [<frame>,<frame>, x = 1, 1]
    Opcode.PopScope,        // [<frame>, 1]
    Opcode.Print,           // [<frame>]
    Opcode.PopScopeVoid,    // []
    Opcode.Halt,
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
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope, // program
    Opcode.IntImmediate,
    1,
    Opcode.IntImmediate,
    2,
    Opcode.AddInt,
    Opcode.Print,
    Opcode.PopScopeVoid,
    Opcode.Halt,
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

  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,
    Opcode.IntImmediate,
    6,
    Opcode.IntImmediate,
    5,
    Opcode.IntImmediate,
    4,
    Opcode.IntImmediate,
    3,
    Opcode.IntImmediate,
    2,
    Opcode.MulInt,
    Opcode.SubInt,
    Opcode.AddInt,
    Opcode.DivInt,
    Opcode.Print,
    Opcode.PopScopeVoid,
    Opcode.Halt,
  ]);
});

it("compiles bools", () => {
  const result = compile([
    { tag: "print", expr: { tag: "typeConstructor", value: "True" } },
  ]);
  expect(Array.from(result.program)).toEqual([
    Opcode.PushScope,
    Opcode.Constant,
    0,
    Opcode.Print,
    Opcode.PopScopeVoid,
    Opcode.Halt,
  ]);
});
