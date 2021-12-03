import {
  StrictMap,
  KeyNotFoundError,
  DuplicateScopeMemberError,
} from "./strict-map";

it("has strict maps", () => {
  const strictMap = new StrictMap<string, number>();
  strictMap.init("foo", 1);
  expect(strictMap.has("foo")).toBe(true);
  expect(strictMap.has("bar")).toBe(false);
  expect(strictMap.get("foo")).toEqual(1);
  expect(strictMap.size).toEqual(1);

  strictMap.set("foo", 2);
  expect(strictMap.get("foo")).toEqual(2);

  expect(() => strictMap.get("bar")).toThrowError(KeyNotFoundError);
  expect(() => strictMap.init("foo", 2)).toThrowError(
    DuplicateScopeMemberError
  );
});

it("constructs strict maps", () => {
  const strictMap = new StrictMap([["foo", 1]]);
  expect(strictMap.has("foo")).toBe(true);
  expect(strictMap.has("bar")).toBe(false);
  expect(strictMap.get("foo")).toEqual(1);
  expect(strictMap.size).toEqual(1);

  expect(() => {
    new StrictMap([
      ["foo", 1],
      ["foo", 2],
    ]);
  }).toThrowError(DuplicateScopeMemberError);
});
