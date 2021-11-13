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
  expect(run(code)).toEqual(["123.45", "0", "6789"]);
});

it("adds", () => {
  expect(run(`print 123456 + 1`)).toEqual(["123457"]);
  expect(run(`print 1.5 + -2.0`)).toEqual(["-0.5"]);
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
    print x
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
    print x
  `;

  expect(() => run(code)).toThrow();
});

it("uses conditional statements", () => {
  const code = `
    if (True) {
      print 1
    }
    print 2
  `;
  expect(run(code)).toEqual(["1", "2"]);
});

it("theoretically uses loops", () => {
  const code = `
    while (!True) {
      print 1
    }
    while (!!False) {
      3
    }
    print 2
  `;
  expect(run(code)).toEqual(["2"]);
});

it("drops expressions called for their side effects", () => {
  const code = `
    let x = 1
    x + 2
    print x + 3
  `;
  expect(run(code)).toEqual(["4"]);
});
