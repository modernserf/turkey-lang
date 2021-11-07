import { interpret } from "./interpreter";
import { Opcode } from "./types";

it("prints numbers", () => {
  const result = interpret({
    constants: [1.0, 1000],
    program: new Uint8Array([
      Opcode.Constant,
      0,
      Opcode.Print,
      Opcode.Constant,
      1,
      Opcode.Print,
      Opcode.IntImmediate,
      1,
      Opcode.Print,
      Opcode.IntImmediate,
      -1,
      Opcode.Print,
      Opcode.Halt,
    ]),
  });
  expect(result).toEqual([1.0, 1000, 1, -1]);
});

it("drops exprs evaluated for side effects", () => {
  const result = interpret({
    constants: [],
    program: new Uint8Array([
      Opcode.IntImmediate,
      1,
      Opcode.IntImmediate,
      2,
      Opcode.Drop,
      Opcode.Print,
      Opcode.Halt,
    ]),
  });
  expect(result).toEqual([1]);
});

it("adds numbers", () => {
  const result = interpret({
    constants: [],
    program: new Uint8Array([
      Opcode.IntImmediate,
      1,
      Opcode.IntImmediate,
      2,
      Opcode.AddInt,
      Opcode.Print,
      Opcode.Halt,
    ]),
  });
  expect(result).toEqual([3]);

  const result2 = interpret({
    constants: [0.5, 1.5],
    program: new Uint8Array([
      Opcode.Constant,
      0,
      Opcode.Constant,
      1,
      Opcode.AddFloat,
      Opcode.Print,
      Opcode.Halt,
    ]),
  });
  expect(result2).toEqual([2.0]);
});

it("subtracts, multiplies, divides", () => {
  const result = interpret({
    constants: [],
    program: new Uint8Array([
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
      Opcode.Halt,
    ]),
  });

  expect(result).toEqual([6 / (5 + (4 - 3 * 2))]);
});

it("works with scopes", () => {
  /*
  let x = 1
  let y = do {
    let z = 2
    z + 3
  }
  print x + y + 4
  */
  const result = interpret({
    constants: [],
    // prettier-ignore
    program: new Uint8Array([ // stack:     
      Opcode.IntImmediate, 1, // [1]
      Opcode.InitLocal,       // [x = 1]
      Opcode.PushScope,       // [x = 1, <frame>]
      Opcode.IntImmediate, 2, // [x = 1, <frame>, 2]
      Opcode.InitLocal,       // [x = 1, <frame>, z = 2]
      Opcode.GetLocal, 2,     // [x = 1, <frame>, z = 2, 2]
      Opcode.IntImmediate, 3, // [x = 1, <frame>, z = 2, 2, 3]
      Opcode.AddInt,          // [x = 1, <frame>, z = 2, 5]
      Opcode.PopScope,        // [x = 1, 5]
      Opcode.InitLocal,       // [x = 1, y = 5]
      Opcode.GetLocal, 0,     // [x = 1, y = 5, 1]
      Opcode.GetLocal, 1,     // [x = 1, y = 5, 1, 5]
      Opcode.AddInt,          // [x = 1, y = 5, 6]
      Opcode.IntImmediate, 4, // [x = 1, y = 5, 6, 4]
      Opcode.AddInt,          // [x = 1, y = 5, 10]
      Opcode.Print,           // [x = 1, y = 5] : [10]
      Opcode.Halt,
    ]),
  });
  expect(result).toEqual([10]);
});

it("jumps", () => {
  const result = interpret({
    constants: [],
    // prettier-ignore
    program: new Uint8Array([
      Opcode.PushScope,
      // if (True)
      Opcode.IntImmediate, 1,
      Opcode.JumpIfZero, 17, 0, 0, 0, // to else
      Opcode.PushScope,
      Opcode.IntImmediate, 1,
      Opcode.PopScope,
      Opcode.Jump, 20, 0, 0, 0, // to end
      // else
      Opcode.PushScope,
      Opcode.IntImmediate, 2,
      Opcode.PopScope,
      // end
      Opcode.Print,
      Opcode.PopScopeVoid,
      Opcode.Halt,
    ]),
  });
  expect(result).toEqual([1]);
});
