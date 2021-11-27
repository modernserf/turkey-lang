import { unify, unifyParam, TypeCheckError, TraitError } from "./checker";
import { createTrait, createType, createVar, Type } from "./types";

const numTrait = createTrait(Symbol("Num"));

const voidType = createType(Symbol("Void"), [], []);
const intType = createType(Symbol("Int"), [], [numTrait]);
const floatType = createType(Symbol("Float"), [], [numTrait]);

it("checks primitives", () => {
  expect(unify(intType, intType)).toEqual(intType);
  expect(unify(floatType, floatType)).toEqual(floatType);

  expect(() => {
    unify(intType, floatType);
  }).toThrowError(TypeCheckError);
});

const tupleName = Symbol("Tuple");
const tuple = (...types: Type[]) => createType(tupleName, types, []);

it("checks complex structures", () => {
  expect(unify(tuple(intType, intType), tuple(intType, intType))).toEqual(
    tuple(intType, intType)
  );

  expect(
    unify(
      tuple(intType, tuple(intType, intType)),
      tuple(intType, tuple(intType, intType))
    )
  ).toEqual(tuple(intType, tuple(intType, intType)));

  expect(() => {
    unify(tuple(intType, intType), tuple(intType));
  }).toThrowError(TypeCheckError);

  expect(() => {
    unify(tuple(intType, intType), tuple(intType, floatType));
  }).toThrowError(TypeCheckError);

  expect(() => {
    unify(tuple(intType, intType), tuple(floatType, floatType));
  }).toThrowError(TypeCheckError);

  expect(() => {
    const otherPair = createType(Symbol("other"), [intType, intType], []);
    unify(tuple(intType, intType), otherPair);
  }).toThrowError(TypeCheckError);
});

it("merges parameterized structures", () => {
  const varT = createVar(Symbol("T"), []);
  const varU = createVar(Symbol("U"), []);
  expect(unify(tuple(intType, varT), tuple(intType, floatType))).toEqual(
    tuple(intType, floatType)
  );

  expect(unify(tuple(intType, varT), tuple(varT, floatType))).toEqual(
    tuple(intType, floatType)
  );

  expect(unify(tuple(intType, varT), tuple(varU, floatType))).toEqual(
    tuple(intType, floatType)
  );

  expect(unify(tuple(intType, varT), tuple(intType, varT))).toEqual(
    tuple(intType, varT)
  );

  expect(unify(tuple(intType, varT), tuple(intType, varU))).toEqual(
    tuple(intType, varT)
  );

  expect(unify(tuple(varT, varT), tuple(varU, intType))).toEqual(
    tuple(intType, intType)
  );

  expect(unify(tuple(intType, varT), tuple(varU, varU))).toEqual(
    tuple(intType, intType)
  );

  expect(() => {
    unify(tuple(intType, varT), tuple(floatType, floatType));
  }).toThrowError(TypeCheckError);
});

it("unifies params one by one", () => {
  const varT = createVar(Symbol("T"), []);
  const varU = createVar(Symbol("U"), []);

  expect(unifyParam(tuple(varT, varT), 0, intType)).toEqual(
    tuple(intType, intType)
  );
  expect(unifyParam(tuple(varT, varU), 0, intType)).toEqual(
    tuple(intType, varU)
  );
  expect(unifyParam(tuple(intType, varU), 0, intType)).toEqual(
    tuple(intType, varU)
  );
  expect(unifyParam(tuple(intType, varU), 0, varT)).toEqual(
    tuple(intType, varU)
  );
});

it("checks traits", () => {
  const numT = createVar(Symbol("T"), [numTrait]);
  const varU = createVar(Symbol("U"), []);

  expect(unify(tuple(intType, numT), tuple(intType, floatType))).toEqual(
    tuple(intType, floatType)
  );

  expect(unify(tuple(numT, numT), tuple(varU, intType))).toEqual(
    tuple(intType, intType)
  );

  expect(unify(tuple(varU, numT), tuple(voidType, floatType))).toEqual(
    tuple(voidType, floatType)
  );

  const fooTrait = createTrait(Symbol("Foo"));
  const fooU = createVar(Symbol("U"), [fooTrait]);

  expect(unify(tuple(intType, numT), tuple(intType, fooU))).toEqual(
    tuple(intType, createVar(numT.name, [numTrait, fooTrait]))
  );

  expect(() => {
    unify(tuple(varU, numT), tuple(floatType, voidType));
  }).toThrowError(TraitError);
});
