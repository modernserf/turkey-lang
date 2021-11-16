import {
  Scope,
  KeyNotFoundError,
  DuplicateScopeMemberError,
  NoParentScopeError,
  InvalidParentScopeError,
} from "./scope";

it("has scopes", () => {
  const scope = new Scope<string, number>();
  scope.init("foo", 1);
  expect(scope.has("foo")).toBe(true);
  expect(scope.has("bar")).toBe(false);
  expect(scope.get("foo")).toEqual(1);
  expect(scope.size).toEqual(1);

  scope.set("foo", 2);
  expect(scope.get("foo")).toEqual(2);

  expect(() => scope.get("bar")).toThrowError(KeyNotFoundError);
  expect(() => scope.init("foo", 2)).toThrowError(DuplicateScopeMemberError);
});

it("has parent scopes", () => {
  const parentScope = new Scope<string, number>() //
    .init("foo", 1)
    .init("bar", 2);

  const childScope = parentScope //
    .push()
    .init("foo", 10)
    .init("baz", 30);

  expect(childScope.size).toEqual(4);
  expect(childScope.has("foo")).toBe(true);
  expect(childScope.has("bar")).toBe(true);
  expect(childScope.get("foo")).toEqual(10);
  expect(childScope.get("bar")).toEqual(2);
  expect(childScope.get("baz")).toEqual(30);

  expect(childScope.isUpvalue("foo", parentScope)).toBe(false);
  expect(childScope.isUpvalue("bar", parentScope)).toBe(true);
  expect(childScope.isUpvalue("baz", parentScope)).toBe(false);

  expect(() => childScope.isUpvalue("quux", parentScope)).toThrowError(
    KeyNotFoundError
  );

  const otherScope = new Scope<string, number>().init("bar", 200);
  expect(() => childScope.isUpvalue("foo", otherScope)).toThrowError(
    InvalidParentScopeError
  );
  expect(() => childScope.isUpvalue("bar", otherScope)).toThrowError(
    InvalidParentScopeError
  );

  expect(childScope.pop()).toBe(parentScope);
  expect(() => parentScope.pop()).toThrowError(NoParentScopeError);
});
