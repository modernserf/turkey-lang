import { TypeChecker as TypeCheckerInner } from "./type-scope-3";
import { Type, ValueType, Trait } from "./types";

class ArityName {
  private map: Map<number, symbol> = new Map();
  use(num: number): symbol {
    const res = this.map.get(num);
    if (res) return res;
    const sym = Symbol(num);
    this.map.set(num, sym);
    return sym;
  }
}

export class TypeChecker {
  private checker = new TypeCheckerInner();
  private funcs = new ArityName();
  private tuples = new ArityName();
  createVar(name: string, traits: Trait[] = []): Type {
    return TypeCheckerInner.createVar(Symbol(name), traits);
  }
  createTrait(name: string): Trait {
    return TypeCheckerInner.createTrait(Symbol(name), []);
  }
  createRec(fn: (value: Type) => Type): Type {
    return this.checker.createRec([], fn);
  }
  createFunc(parameters: Type[], returnType: Type): Type {
    return TypeCheckerInner.createValue(
      this.funcs.use(parameters.length),
      [returnType, ...parameters],
      [],
      []
    );
  }
  createTuple(fields: Type[]): Type {
    return TypeCheckerInner.createValue(
      this.tuples.use(fields.length),
      fields,
      [],
      []
    );
  }
  createPrimitive(name: string, traits: Trait[] = []): ValueType {
    return TypeCheckerInner.createValue(Symbol(name), [], [], traits);
  }
  createStruct(
    name: string | symbol,
    typeParameters: Type[],
    fields: Type[]
  ): ValueType {
    const sym = typeof name === "symbol" ? name : Symbol(name);
    return TypeCheckerInner.createValue(sym, typeParameters, fields, []);
  }
  callFunc(callee: Type, args: Type[], returnType: Type): Type {
    return this.checker.getAllMatchTypes(
      callee,
      this.funcs.use(args.length),
      [returnType, ...args],
      "cannot call with args"
    )[0];
  }
  unpackTuple(tuple: Type, expectedResult: Type[]): Type[] {
    return this.checker.getAllMatchTypes(
      tuple,
      this.tuples.use(expectedResult.length),
      expectedResult,
      "cannot unpack tuple"
    );
  }
  getField(target: Type, type: symbol, index: number, fieldType: Type): Type {
    return this.checker.getField(
      target,
      type,
      index,
      fieldType,
      "cannot get field"
    );
  }
}

it("checks func calls", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");

  const intToIntFunc = checker.createFunc([intType], intType);
  expect(checker.callFunc(intToIntFunc, [intType], intType)).toEqual(intType);

  expect(
    checker.callFunc(intToIntFunc, [intType], checker.createVar("a"))
  ).toEqual(intType);

  expect(() => {
    checker.callFunc(intToIntFunc, [intType], floatType);
  }).toThrow();
  expect(() => {
    checker.callFunc(intToIntFunc, [floatType], intType);
  }).toThrow();
  expect(() => {
    checker.callFunc(intToIntFunc, [], intType);
  }).toThrow();
  expect(() => {
    checker.callFunc(intToIntFunc, [intType, intType], intType);
  }).toThrow();
  expect(() => {
    checker.callFunc(checker.createVar("b"), [intType, intType], intType);
  }).toThrow();
});

it("checks parameterized func calls", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");
  const tType = checker.createVar("T");

  const idFunc = checker.createFunc([tType], tType);

  expect(checker.callFunc(idFunc, [intType], intType)).toEqual(intType);
  expect(checker.callFunc(idFunc, [floatType], floatType)).toEqual(floatType);

  const unboundType = checker.createVar("var");
  expect(checker.callFunc(idFunc, [floatType], unboundType)).toEqual(floatType);
  expect(checker.callFunc(idFunc, [unboundType], floatType)).toEqual(floatType);
  expect(() => {
    checker.callFunc(idFunc, [intType], floatType);
  }).toThrow();
});

it("checks nested parameterized func calls", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");
  const tType = checker.createVar("T");
  const uType = checker.createVar("U");

  // T => (T => U) => U
  const curriedFunc = checker.createFunc(
    [tType],
    checker.createFunc([checker.createFunc([tType], uType)], uType)
  );

  // called as fn(int)(int => float)
  expect(
    checker.callFunc(
      checker.callFunc(curriedFunc, [intType], checker.createVar("a")),
      [checker.createFunc([intType], floatType)],
      checker.createVar("b")
    )
  ).toEqual(floatType);

  // called as fn(int)(float => float)
  expect(() =>
    checker.callFunc(
      checker.callFunc(curriedFunc, [intType], checker.createVar("a")),
      [checker.createFunc([floatType], floatType)],
      checker.createVar("b")
    )
  ).toThrow();
  // called as fn(int)(int, int => float)
  expect(() =>
    checker.callFunc(
      checker.callFunc(curriedFunc, [intType], checker.createVar("a")),
      [checker.createFunc([intType, intType], floatType)],
      checker.createVar("b")
    )
  ).toThrow();
});

it("checks tuples", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");

  const intPair = checker.createTuple([intType, intType]);

  expect(checker.unpackTuple(intPair, [intType, intType])).toEqual([
    intType,
    intType,
  ]);
  expect(
    checker.unpackTuple(intPair, [
      checker.createVar("x"),
      checker.createVar("y"),
    ])
  ).toEqual([intType, intType]);

  const nestedTuple = checker.createTuple([floatType, intPair]);

  expect(checker.unpackTuple(nestedTuple, [floatType, intPair])).toEqual([
    floatType,
    intPair,
  ]);
  expect(
    checker.unpackTuple(nestedTuple, [
      checker.createVar("a"),
      checker.createTuple([checker.createVar("b"), intType]),
    ])
  ).toEqual([floatType, intPair]);

  expect(() => checker.unpackTuple(intPair, [intType, floatType])).toThrow();
  expect(() => checker.unpackTuple(intPair, [intType])).toThrow();
  expect(() =>
    checker.unpackTuple(intPair, [intType, intType, intType])
  ).toThrow();
  expect(() =>
    checker.unpackTuple(nestedTuple, [
      checker.createVar("a"),
      checker.createTuple([checker.createVar("b"), floatType]),
    ])
  ).toThrow();
});

it("checks structs", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");
  const simpleStruct = checker.createStruct(
    "intFloat",
    [],
    [intType, floatType]
  );
  expect(
    checker.getField(simpleStruct, simpleStruct.name, 0, checker.createVar("a"))
  ).toEqual(intType);
  expect(
    checker.getField(simpleStruct, simpleStruct.name, 1, floatType)
  ).toEqual(floatType);

  expect(() => {
    expect(
      checker.getField(simpleStruct, Symbol("other"), 1, floatType)
    ).toEqual(floatType);
  }).toThrow();
  expect(() => {
    expect(checker.getField(intType, simpleStruct.name, 1, floatType)).toEqual(
      floatType
    );
  }).toThrow();
});

it("checks nested structs", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");
  const simpleStruct = checker.createStruct(
    "intFloat",
    [],
    [intType, floatType]
  );
  const complexStruct = checker.createStruct(
    "intIntFloat",
    [],
    [intType, simpleStruct]
  );
  expect(
    checker.getField(
      complexStruct,
      complexStruct.name,
      0,
      checker.createVar("a")
    )
  ).toEqual(intType);
  expect(
    checker.getField(
      complexStruct,
      complexStruct.name,
      1,
      checker.createVar("b")
    )
  ).toEqual(simpleStruct);
});

it("checks parameterized structs", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const floatType = checker.createPrimitive("float");
  const tType = checker.createVar("T");
  const intTStruct = checker.createStruct(
    "intTStruct",
    [tType],
    [intType, tType]
  );

  expect(
    checker.getField(intTStruct, intTStruct.name, 0, checker.createVar("a"))
  ).toEqual(intType);

  expect(checker.getField(intTStruct, intTStruct.name, 1, intType)).toEqual(
    intType
  );
  expect(checker.getField(intTStruct, intTStruct.name, 1, floatType)).toEqual(
    floatType
  );

  const getField1 = checker.createFunc([intTStruct], tType);
  expect(
    checker.callFunc(
      getField1,
      [
        checker.createStruct(
          intTStruct.name,
          [floatType],
          [intType, floatType]
        ),
      ],
      checker.createVar("b")
    )
  ).toEqual(floatType);

  expect(() =>
    checker.callFunc(
      getField1,
      [
        checker.createStruct(
          Symbol("other"),
          [floatType],
          [intType, floatType]
        ),
      ],
      checker.createVar("b")
    )
  ).toThrow();
});

it("checks recursive values", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const intList = checker.createRec((rec) =>
    checker.createStruct("intList", [], [intType, rec])
  );
  expect(
    checker.getField(intList, intList.name, 0, checker.createVar("a"))
  ).toEqual(intType);
  // NOTE: cannot use .toEqual here because of circular structure
  expect(
    checker.getField(intList, intList.name, 1, checker.createVar("a"))
  ).toMatchObject({ tag: "value", name: intList.name });
  expect(
    checker.getField(
      checker.getField(intList, intList.name, 1, checker.createVar("a")),
      intList.name,
      0,
      checker.createVar("c")
    )
  ).toEqual(intType);
  expect(() =>
    checker.getField(
      intList,
      intList.name,
      1,
      checker.createStruct("otherType", [], [intType, intList])
    )
  ).toThrow();

  const car = checker.createFunc([intList], intType);
  const cdr = checker.createFunc([intList], intList);
  expect(checker.callFunc(car, [intList], intType)).toEqual(intType);
  expect(
    checker.callFunc(car, [checker.callFunc(cdr, [intList], intList)], intType)
  ).toEqual(intType);
});

it("checks parameterized recursive values", () => {
  const checker = new TypeChecker();
  const intType = checker.createPrimitive("int");
  const tType = checker.createVar("T");
  const tList = checker.createRec((rec) =>
    checker.createStruct("tList", [tType], [tType, rec])
  );
  const car = checker.createFunc([tList], tType);
  const cdr = checker.createFunc([tList], tList);

  const intList = checker.createRec((rec) =>
    checker.createStruct(tList.name, [intType], [intType, rec])
  );
  expect(checker.callFunc(car, [intList], checker.createVar("a"))).toEqual(
    intType
  );
  expect(
    checker.callFunc(car, [checker.callFunc(cdr, [intList], intList)], intType)
  ).toEqual(intType);
});

it("checks traits", () => {
  const checker = new TypeChecker();
  const numTrait = checker.createTrait("num");
  const printTrait = checker.createTrait("print");
  const intType = checker.createPrimitive("int", [numTrait, printTrait]);
  const floatType = checker.createPrimitive("float", [numTrait, printTrait]);
  const stringType = checker.createPrimitive("string", [printTrait]);

  const numType = checker.createVar("num", [numTrait]);
  const add = checker.createFunc([numType, numType], numType);

  expect(() => {
    checker.callFunc(add, [stringType, stringType], stringType);
  }).toThrow();

  expect(
    checker.callFunc(
      add,
      [intType, intType],
      checker.createVar("a", [numTrait])
    )
  ).toEqual(intType);
  expect(
    checker.callFunc(
      add,
      [floatType, floatType],
      checker.createVar("b", [numTrait])
    )
  ).toEqual(floatType);
  expect(() => {
    checker.callFunc(
      add,
      [intType, floatType],
      checker.createVar("c", [numTrait])
    );
  }).toThrow();
});
