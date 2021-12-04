import { parse as parseInner, ParseError } from "./parser";
import { lex } from "./lexer";

const parse = (code: string) => parseInner(lex(code));

it("gets error tokens when input is totally malformed", () => {
  const code = `
    print(™
  `;
  const tokens = lex(code);
  expect(tokens).toMatchInlineSnapshot(`
Array [
  Object {
    "tag": "identifier",
    "value": "print",
  },
  Object {
    "tag": "(",
  },
  Object {
    "tag": "error",
    "value": "™",
  },
]
`);
  expect(() => {
    parseInner(tokens);
  }).toThrowError(ParseError);
});

it("parses simple literals", () => {
  expect(parse("1")).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "integer",
      "value": 1,
    },
    "tag": "expr",
  },
]
`);
  expect(parse("1.5")).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "float",
      "value": 1.5,
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`"hello, there"`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "string",
      "value": "hello, there",
    },
    "tag": "expr",
  },
]
`);
});

it("parses identifiers", () => {
  expect(parse(`foo`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "identifier",
      "value": "foo",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`bAR_123`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "identifier",
      "value": "bAR_123",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`_1`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "identifier",
      "value": "_1",
    },
    "tag": "expr",
  },
]
`);
});

it("parses tuples", () => {
  expect(parse(`()`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [],
      "tag": "tuple",
    },
    "tag": "expr",
  },
]
`);
  // note: trailing comma for 1-tuple
  expect(parse(`(1,)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "integer",
          "value": 1,
        },
      ],
      "tag": "tuple",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`(1, "hello")`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "integer",
          "value": 1,
        },
        Object {
          "tag": "string",
          "value": "hello",
        },
      ],
      "tag": "tuple",
    },
    "tag": "expr",
  },
]
`);
});

it("parses lists", () => {
  expect(parse(`[]`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [],
      "tag": "list",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`[1,2]`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "integer",
          "value": 1,
        },
        Object {
          "tag": "integer",
          "value": 2,
        },
      ],
      "tag": "list",
    },
    "tag": "expr",
  },
]
`);
});

it("parses type constructors", () => {
  expect(parse(`True`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "tag": "typeLiteral",
      "value": "True",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`Some("body")`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "string",
          "value": "body",
        },
      ],
      "tag": "typeTuple",
      "value": "Some",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`Cons(1, Nil)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "integer",
          "value": 1,
        },
        Object {
          "tag": "typeLiteral",
          "value": "Nil",
        },
      ],
      "tag": "typeTuple",
      "value": "Cons",
    },
    "tag": "expr",
  },
]
`);
});

it("parses type constructors with named fields", () => {
  expect(parse(`User { id: 1, name: "Alice" }`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "fields": Array [
        Object {
          "expr": Object {
            "tag": "integer",
            "value": 1,
          },
          "fieldName": "id",
        },
        Object {
          "expr": Object {
            "tag": "string",
            "value": "Alice",
          },
          "fieldName": "name",
        },
      ],
      "tag": "typeRecord",
      "value": "User",
    },
    "tag": "expr",
  },
]
`);
});

it("parses type constructors with punned fields", () => {
  expect(parse(`User { id, name, }`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "fields": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "id",
          },
          "fieldName": "id",
        },
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "name",
          },
          "fieldName": "name",
        },
      ],
      "tag": "typeRecord",
      "value": "User",
    },
    "tag": "expr",
  },
]
`);
});

it("parses closure literals", () => {
  expect(parse(`|| x`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "block": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "x",
          },
          "tag": "expr",
        },
      ],
      "parameters": Array [],
      "tag": "closure",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`|x| x`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "block": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "x",
          },
          "tag": "expr",
        },
      ],
      "parameters": Array [
        Object {
          "tag": "identifier",
          "value": "x",
        },
      ],
      "tag": "closure",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`|x| { x }`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "block": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "x",
          },
          "tag": "expr",
        },
      ],
      "parameters": Array [
        Object {
          "tag": "identifier",
          "value": "x",
        },
      ],
      "tag": "closure",
    },
    "tag": "expr",
  },
]
`);
});

it("parses unary operators", () => {
  expect(parse(`-foo`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "expr": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "operator": "-",
      "tag": "unaryOp",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`!bar`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "expr": Object {
        "tag": "identifier",
        "value": "bar",
      },
      "operator": "!",
      "tag": "unaryOp",
    },
    "tag": "expr",
  },
]
`);
});

it("parses binary operators", () => {
  expect(parse(`foo + bar`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "left": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "operator": "+",
      "right": Object {
        "tag": "identifier",
        "value": "bar",
      },
      "tag": "binaryOp",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`foo - bar`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "left": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "operator": "-",
      "right": Object {
        "tag": "identifier",
        "value": "bar",
      },
      "tag": "binaryOp",
    },
    "tag": "expr",
  },
]
`);
});

it("rejects incomplete operator expressions", () => {
  expect(() => parse(`foo +`)).toThrowError(ParseError);
});

it("parses operators with precedence", () => {
  expect(parse(`1 + 2 * 3 / 4`)).toEqual(parse(`1 + ((2 * 3) / 4)`));
});

it("parses function calls", () => {
  expect(parse(`foo(bar, baz)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "tag": "identifier",
          "value": "bar",
        },
        Object {
          "tag": "identifier",
          "value": "baz",
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "tag": "call",
    },
    "tag": "expr",
  },
]
`);
});

it("parses function calls in method order", () => {
  expect(parse(`bar.foo(baz)`)).toEqual(parse(`foo(bar, baz)`));
  expect(parse(`bar.foo()`)).toEqual(parse(`foo(bar)`));
  // TODO: not sure about this one
  expect(parse(`bar.foo`)).toEqual(parse(`foo(bar)`));
});

it("parses field access", () => {
  expect(parse(`foo:x`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "expr": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "fieldName": "x",
      "tag": "field",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`foo:0`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "expr": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "index": 0,
      "tag": "index",
    },
    "tag": "expr",
  },
]
`);
});

it("parses type aliases and expressions", () => {
  expect(parse(`type Foo = Bar`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Foo",
    },
    "tag": "type",
    "type": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Bar",
    },
  },
]
`);
  expect(parse(`type Foo<Arg> = Bar<Arg, Baz>`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "traits": Array [],
          "value": "Arg",
        },
      ],
      "value": "Foo",
    },
    "tag": "type",
    "type": Object {
      "tag": "identifier",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Arg",
        },
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Baz",
        },
      ],
      "value": "Bar",
    },
  },
]
`);
});

it("parses tuple type literals", () => {
  expect(parse(`type Void = ()`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Void",
    },
    "tag": "type",
    "type": Object {
      "tag": "tuple",
      "typeArgs": Array [],
    },
  },
]
`);
  expect(parse(`type Cell = (Int,)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Cell",
    },
    "tag": "type",
    "type": Object {
      "tag": "tuple",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      ],
    },
  },
]
`);
  expect(parse(`type Point = (Int, Int)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Point",
    },
    "tag": "type",
    "type": Object {
      "tag": "tuple",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      ],
    },
  },
]
`);
});

it("parses func type literals", () => {
  expect(parse(`type Mapper<From, To> = func (From): To`))
    .toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "traits": Array [],
          "value": "From",
        },
        Object {
          "tag": "identifier",
          "traits": Array [],
          "value": "To",
        },
      ],
      "value": "Mapper",
    },
    "tag": "type",
    "type": Object {
      "parameters": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "From",
        },
      ],
      "returnType": Object {
        "tag": "identifier",
        "typeArgs": Array [],
        "value": "To",
      },
      "tag": "func",
      "typeParameters": Array [],
    },
  },
]
`);
});

it("parses struct type declarations", () => {
  expect(parse(`struct Foo`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Foo",
    },
    "fields": Array [],
    "isTuple": false,
    "tag": "struct",
  },
]
`);
  expect(parse(`struct Foo(Int, Int)`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Foo",
    },
    "fields": Array [
      Object {
        "fieldName": "0",
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
      Object {
        "fieldName": "1",
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
    ],
    "isTuple": true,
    "tag": "struct",
  },
]
`);
  expect(
    parse(`
    struct Foo { 
      x: Int, 
      y: Int, 
    }`)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Foo",
    },
    "fields": Array [
      Object {
        "fieldName": "x",
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
      Object {
        "fieldName": "y",
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
    ],
    "isTuple": false,
    "tag": "struct",
  },
]
`);
});

it("parses enum type declarations", () => {
  expect(parse(`enum Tag { V1, V2 }`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Tag",
    },
    "cases": Array [
      Object {
        "fields": Array [],
        "isTuple": false,
        "tagName": "V1",
      },
      Object {
        "fields": Array [],
        "isTuple": false,
        "tagName": "V2",
      },
    ],
    "tag": "enum",
  },
]
`);
  expect(
    parse(`
    enum Maybe<T> {
      None,
      Some(T),
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "traits": Array [],
          "value": "T",
        },
      ],
      "value": "Maybe",
    },
    "cases": Array [
      Object {
        "fields": Array [],
        "isTuple": false,
        "tagName": "None",
      },
      Object {
        "fields": Array [
          Object {
            "fieldName": "0",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "T",
            },
          },
        ],
        "isTuple": true,
        "tagName": "Some",
      },
    ],
    "tag": "enum",
  },
]
`);
  expect(
    parse(`
    enum AST {
      Number(Int),
      Add { left: AST, right: AST }
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "AST",
    },
    "cases": Array [
      Object {
        "fields": Array [
          Object {
            "fieldName": "0",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Int",
            },
          },
        ],
        "isTuple": true,
        "tagName": "Number",
      },
      Object {
        "fields": Array [
          Object {
            "fieldName": "left",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "AST",
            },
          },
          Object {
            "fieldName": "right",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "AST",
            },
          },
        ],
        "isTuple": false,
        "tagName": "Add",
      },
    ],
    "tag": "enum",
  },
]
`);
});

it("parses let bindings", () => {
  expect(parse(`let x = 1`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "x",
    },
    "expr": Object {
      "tag": "integer",
      "value": 1,
    },
    "tag": "let",
    "type": null,
  },
]
`);
  expect(parse(`let x: Int = 1`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "x",
    },
    "expr": Object {
      "tag": "integer",
      "value": 1,
    },
    "tag": "let",
    "type": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Int",
    },
  },
]
`);
});

it("parses let bindings with destructuring", () => {
  expect(parse(`let { x, y } = point`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "fields": Array [
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "x",
          },
          "fieldName": "x",
        },
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "y",
          },
          "fieldName": "y",
        },
      ],
      "tag": "struct",
    },
    "expr": Object {
      "tag": "identifier",
      "value": "point",
    },
    "tag": "let",
    "type": null,
  },
]
`);
  expect(parse(`let { x: new_x, y: new_y, } = point`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "fields": Array [
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "new_x",
          },
          "fieldName": "x",
        },
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "new_y",
          },
          "fieldName": "y",
        },
      ],
      "tag": "struct",
    },
    "expr": Object {
      "tag": "identifier",
      "value": "point",
    },
    "tag": "let",
    "type": null,
  },
]
`);
  expect(parse(`let (a, b) = pair`)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "fields": Array [
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "a",
          },
          "fieldName": "0",
        },
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "b",
          },
          "fieldName": "1",
        },
      ],
      "tag": "struct",
    },
    "expr": Object {
      "tag": "identifier",
      "value": "pair",
    },
    "tag": "let",
    "type": null,
  },
]
`);
});

it("parses while loops", () => {
  expect(
    parse(`
    while (foo) {
      bar(foo)
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "value": "foo",
            },
          ],
          "expr": Object {
            "tag": "identifier",
            "value": "bar",
          },
          "tag": "call",
        },
        "tag": "expr",
      },
    ],
    "expr": Object {
      "tag": "identifier",
      "value": "foo",
    },
    "tag": "while",
  },
]
`);
});

it("parses for loops", () => {
  expect(
    parse(`
    for (x in list) {
      foo(x)
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "x",
    },
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "value": "x",
            },
          ],
          "expr": Object {
            "tag": "identifier",
            "value": "foo",
          },
          "tag": "call",
        },
        "tag": "expr",
      },
    ],
    "expr": Object {
      "tag": "identifier",
      "value": "list",
    },
    "tag": "for",
  },
]
`);
});

it("parses func declarations", () => {
  expect(
    parse(`
    func foo (bar: Int, baz: String): String {
      return baz
    } 
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "tag": "identifier",
          "value": "baz",
        },
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "bar",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "baz",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "String",
    },
    "tag": "func",
    "typeParameters": Array [],
  },
]
`);
  expect(
    parse(`
  func foo (bar: Int, baz: String): Void {
    return
  } 
`)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "bar",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Int",
        },
      },
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "baz",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Void",
    },
    "tag": "func",
    "typeParameters": Array [],
  },
]
`);
});

it("parses func declarations with type parameters and trait constraints", () => {
  expect(
    parse(`
    func foo <
      T: Show + Eq, 
      U, 
      V: Num,
    > (
      t: T, 
      u: U, 
      v: V,
    ): Void {}
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [],
    "name": "foo",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "t",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "T",
        },
      },
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "u",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "U",
        },
      },
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "v",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "V",
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Void",
    },
    "tag": "func",
    "typeParameters": Array [
      Object {
        "tag": "identifier",
        "traits": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Show",
          },
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Eq",
          },
        ],
        "value": "T",
      },
      Object {
        "tag": "identifier",
        "traits": Array [],
        "value": "U",
      },
      Object {
        "tag": "identifier",
        "traits": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Num",
          },
        ],
        "value": "V",
      },
    ],
  },
]
`);
});

it("parses trait declarations", () => {
  expect(
    parse(`
    trait Fooable {
      func foo (Self): String
      func bar (Int): Self
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Fooable",
    },
    "fields": Array [
      Object {
        "name": "foo",
        "parameters": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Self",
          },
        ],
        "returnType": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
        "tag": "func",
        "typeParameters": Array [],
      },
      Object {
        "name": "bar",
        "parameters": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Int",
          },
        ],
        "returnType": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Self",
        },
        "tag": "func",
        "typeParameters": Array [],
      },
    ],
    "tag": "trait",
  },
]
`);
  expect(
    parse(`
    trait Fooable<T: Show> {
      func foo (Self, T): String
      func bar (T): Self
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "traits": Array [
            Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Show",
            },
          ],
          "value": "T",
        },
      ],
      "value": "Fooable",
    },
    "fields": Array [
      Object {
        "name": "foo",
        "parameters": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "Self",
          },
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "T",
          },
        ],
        "returnType": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
        "tag": "func",
        "typeParameters": Array [],
      },
      Object {
        "name": "bar",
        "parameters": Array [
          Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "T",
          },
        ],
        "returnType": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "Self",
        },
        "tag": "func",
        "typeParameters": Array [],
      },
    ],
    "tag": "trait",
  },
]
`);
});

it("parses trait impls", () => {
  expect(
    parse(`
    impl Fooable for String {
      func foo (self: Self): String {
        self
      }
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "block": Array [
          Object {
            "expr": Object {
              "tag": "identifier",
              "value": "self",
            },
            "tag": "expr",
          },
        ],
        "name": "foo",
        "parameters": Array [
          Object {
            "binding": Object {
              "tag": "identifier",
              "value": "self",
            },
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Self",
            },
          },
        ],
        "returnType": Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
        "tag": "func",
        "typeParameters": Array [],
      },
    ],
    "tag": "impl",
    "target": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "String",
    },
    "trait": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Fooable",
    },
    "typeParameters": Array [],
  },
]
`);

  expect(
    parse(`
    impl Fooable<String> for String {
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [],
    "tag": "impl",
    "target": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "String",
    },
    "trait": Object {
      "tag": "identifier",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "String",
        },
      ],
      "value": "Fooable",
    },
    "typeParameters": Array [],
  },
]
`);

  expect(
    parse(`
    impl <T> Fooable<T> for Cell<T> {
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [],
    "tag": "impl",
    "target": Object {
      "tag": "identifier",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "T",
        },
      ],
      "value": "Cell",
    },
    "trait": Object {
      "tag": "identifier",
      "typeArgs": Array [
        Object {
          "tag": "identifier",
          "typeArgs": Array [],
          "value": "T",
        },
      ],
      "value": "Fooable",
    },
    "typeParameters": Array [
      Object {
        "tag": "identifier",
        "traits": Array [],
        "value": "T",
      },
    ],
  },
]
`);
});

it("parses do expressions", () => {
  expect(
    parse(`do { 
    let x = 1
    x
  }`)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "block": Array [
        Object {
          "binding": Object {
            "tag": "identifier",
            "value": "x",
          },
          "expr": Object {
            "tag": "integer",
            "value": 1,
          },
          "tag": "let",
          "type": null,
        },
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "x",
          },
          "tag": "expr",
        },
      ],
      "tag": "do",
    },
    "tag": "expr",
  },
]
`);
});

it("parses if expressions", () => {
  expect(parse(`if (x > 1) { x }`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "x",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "left": Object {
              "tag": "identifier",
              "value": "x",
            },
            "operator": ">",
            "right": Object {
              "tag": "integer",
              "value": 1,
            },
            "tag": "binaryOp",
          },
          "tag": "cond",
        },
      ],
      "elseBlock": Array [],
      "tag": "if",
    },
    "tag": "expr",
  },
]
`);
  expect(
    parse(`
  if (x > 1) { 
    x 
  } else if (y > 2) { 
    y 
  }`)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "x",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "left": Object {
              "tag": "identifier",
              "value": "x",
            },
            "operator": ">",
            "right": Object {
              "tag": "integer",
              "value": 1,
            },
            "tag": "binaryOp",
          },
          "tag": "cond",
        },
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "y",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "left": Object {
              "tag": "identifier",
              "value": "y",
            },
            "operator": ">",
            "right": Object {
              "tag": "integer",
              "value": 2,
            },
            "tag": "binaryOp",
          },
          "tag": "cond",
        },
      ],
      "elseBlock": Array [],
      "tag": "if",
    },
    "tag": "expr",
  },
]
`);
  expect(
    parse(`
  if (x > 1) { 
    x 
  } else if (y > 2) { 
    y 
  } else {
    z
  }`)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "x",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "left": Object {
              "tag": "identifier",
              "value": "x",
            },
            "operator": ">",
            "right": Object {
              "tag": "integer",
              "value": 1,
            },
            "tag": "binaryOp",
          },
          "tag": "cond",
        },
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "y",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "left": Object {
              "tag": "identifier",
              "value": "y",
            },
            "operator": ">",
            "right": Object {
              "tag": "integer",
              "value": 2,
            },
            "tag": "binaryOp",
          },
          "tag": "cond",
        },
      ],
      "elseBlock": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "z",
          },
          "tag": "expr",
        },
      ],
      "tag": "if",
    },
    "tag": "expr",
  },
]
`);
});

it("parses match expressions", () => {
  expect(
    parse(`
    match (list) {
      Nil => 0,
      Cons(head, tail) => {
        1 + length(tail)
      }
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "binding": Object {
            "fields": Array [],
            "tag": "typeIdentifier",
            "value": "Nil",
          },
          "block": Array [
            Object {
              "expr": Object {
                "tag": "integer",
                "value": 0,
              },
              "tag": "expr",
            },
          ],
        },
        Object {
          "binding": Object {
            "fields": Array [
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "head",
                },
                "fieldName": "0",
              },
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "tail",
                },
                "fieldName": "1",
              },
            ],
            "tag": "typeIdentifier",
            "value": "Cons",
          },
          "block": Array [
            Object {
              "expr": Object {
                "left": Object {
                  "tag": "integer",
                  "value": 1,
                },
                "operator": "+",
                "right": Object {
                  "args": Array [
                    Object {
                      "tag": "identifier",
                      "value": "tail",
                    },
                  ],
                  "expr": Object {
                    "tag": "identifier",
                    "value": "length",
                  },
                  "tag": "call",
                },
                "tag": "binaryOp",
              },
              "tag": "expr",
            },
          ],
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "list",
      },
      "tag": "match",
    },
    "tag": "expr",
  },
]
`);
  expect(
    parse(`
    match (ast) {
      Number(x) => x,
      Add { left, right } => left + right,
    }
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "binding": Object {
            "fields": Array [
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "x",
                },
                "fieldName": "0",
              },
            ],
            "tag": "typeIdentifier",
            "value": "Number",
          },
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "x",
              },
              "tag": "expr",
            },
          ],
        },
        Object {
          "binding": Object {
            "fields": Array [
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "left",
                },
                "fieldName": "left",
              },
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "right",
                },
                "fieldName": "right",
              },
            ],
            "tag": "typeIdentifier",
            "value": "Add",
          },
          "block": Array [
            Object {
              "expr": Object {
                "left": Object {
                  "tag": "identifier",
                  "value": "left",
                },
                "operator": "+",
                "right": Object {
                  "tag": "identifier",
                  "value": "right",
                },
                "tag": "binaryOp",
              },
              "tag": "expr",
            },
          ],
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "ast",
      },
      "tag": "match",
    },
    "tag": "expr",
  },
]
`);
});

it("disambiguates expressions with semicolon", () => {
  expect(
    parse(`
    1
    -2 
  `)
  ).toEqual(parse(`1 - 2`));

  expect(
    parse(`
    1;
    -2
  `)
  ).toEqual(parse(`1; (-2)`));
});

it("supports typed array literals", () => {
  expect(parse(`Array [1,2,3]`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "items": Array [
        Object {
          "tag": "integer",
          "value": 1,
        },
        Object {
          "tag": "integer",
          "value": 2,
        },
        Object {
          "tag": "integer",
          "value": 3,
        },
      ],
      "tag": "typeList",
      "value": "Array",
    },
    "tag": "expr",
  },
]
`);
  expect(parse(`Array [0; 32]`)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "expr": Object {
        "tag": "integer",
        "value": 0,
      },
      "size": 32,
      "tag": "typeSizedList",
      "value": "Array",
    },
    "tag": "expr",
  },
]
`);
});

it("supports array types", () => {
  expect(
    parse(`
    type Vec4<T> = Array [T; 4] 
  `)
  ).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "traits": Array [],
          "value": "T",
        },
      ],
      "value": "Vec4",
    },
    "tag": "type",
    "type": Object {
      "size": 4,
      "tag": "array",
      "type": Object {
        "tag": "identifier",
        "typeArgs": Array [],
        "value": "T",
      },
      "value": "Array",
    },
  },
]
`);
});

it("supports array assignment", () => {
  expect(parse(`arr:0 = 1`)).toMatchInlineSnapshot(`
Array [
  Object {
    "index": 0,
    "tag": "assign",
    "target": Object {
      "tag": "identifier",
      "value": "arr",
    },
    "value": Object {
      "tag": "integer",
      "value": 1,
    },
  },
]
`);
});

it("rejects invalid assignment LHS", () => {
  expect(() => {
    parse(`arr = 1`);
  }).toThrow();
  expect(() => {
    parse(`arr:x = 1`);
  }).toThrow();
});
