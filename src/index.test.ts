import run from "./index";

it("evaluates an empty program", () => {
  expect(run("")).toEqual([]);
});

it("prints", () => {
  const code = `
    print 123.45 // a number
    print 0      // another one
    print 6789   // the last number
  `;
  expect(run(code)).toEqual([123.45, 0, 6789]);
});

it("adds", () => {
  expect(run(`print 123456 + 1`)).toEqual([123457]);
  expect(run(`print 1.5 + 2.0`)).toEqual([3.5]);
});

it("typechecks math", () => {
  expect(() => {
    run(`print 1.5 + 2`);
  }).toThrow();
});

it("references variables", () => {
  const code = `
    let x = 1
    let y = 2 + 3
    print x + y + 4
  `;
  expect(run(code)).toEqual([10]);
});
