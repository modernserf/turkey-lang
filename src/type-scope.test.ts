import { TypeScope } from "./type-scope";

const int = { tag: "integer" } as const;
const float = { tag: "float" } as const;

it("unifies simple types", () => {
  const scope = new TypeScope();
  expect(scope.unify(int, int)).toEqual(int);
  expect(scope.unify(float, float)).toEqual(float);
  expect(scope.resolve(int)).toEqual(int);
  expect(scope.resolve(float)).toEqual(float);
  expect(() => scope.unify(int, float)).toThrow();
  expect(() => scope.unify(float, int)).toThrow();
});

it("unifies type params", () => {
  const scope = new TypeScope();
  const foo = scope.var("foo");
  expect(scope.unify(int, foo)).toEqual(int);
  expect(scope.resolve(foo)).toEqual(int);
  expect(() => scope.unify(float, foo)).toThrow();

  const bar = scope.var("bar");
  expect(() => scope.resolve(bar)).toThrow();
});

it("resolves chains of type params", () => {
  const scope = new TypeScope();
  const foo = scope.var("foo");
  const bar = scope.var("bar");
  scope.unify(foo, bar);
  scope.unify(foo, int);
  expect(scope.resolve(foo)).toEqual(int);
  expect(scope.resolve(bar)).toEqual(int);
});

it("handles direct circular references", () => {
  const scope = new TypeScope();
  const foo = scope.var("foo");
  scope.unify(foo, foo);
  scope.unify(foo, int);
  expect(scope.resolve(foo)).toEqual(int);
});

it("handles indirect circular references", () => {
  const scope = new TypeScope();
  const foo = scope.var("foo");
  const bar = scope.var("bar");
  scope.unify(foo, bar);
  scope.unify(bar, foo);
  scope.unify(foo, int);
  expect(scope.resolve(foo)).toEqual(int);
  expect(scope.resolve(bar)).toEqual(int);
});
