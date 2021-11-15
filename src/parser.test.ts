import { parse } from "./parser";
import { lex } from "./lexer";
import { ParseError } from "./types";

it("parses print, let, numbers", () => {
  const code = `
    print(0 + 123)   // add ints
    let x = 123.45   // a float
    print(x + 67.89) // add floats
  `;
  const ast = parse(lex(code));
  expect(ast).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "left": Object {
            "tag": "integer",
            "value": 0,
          },
          "operator": "+",
          "right": Object {
            "tag": "integer",
            "value": 123,
          },
          "tag": "binaryOp",
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "print",
      },
      "tag": "call",
    },
    "tag": "expr",
  },
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "x",
    },
    "expr": Object {
      "tag": "float",
      "value": 123.45,
    },
    "tag": "let",
    "type": null,
  },
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "left": Object {
            "tag": "identifier",
            "value": "x",
          },
          "operator": "+",
          "right": Object {
            "tag": "float",
            "value": 67.89,
          },
          "tag": "binaryOp",
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "print",
      },
      "tag": "call",
    },
    "tag": "expr",
  },
]
`);
});

it("parses do blocks", () => {
  const ast = parse(
    lex(`
    do {
      let x = 1
      x + 2
    }
  `)
  );
  expect(ast).toMatchInlineSnapshot(`
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
            "left": Object {
              "tag": "identifier",
              "value": "x",
            },
            "operator": "+",
            "right": Object {
              "tag": "integer",
              "value": 2,
            },
            "tag": "binaryOp",
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

it("parses equations", () => {
  const ast = parse(lex(`a * b + c / d - e`));
  const ast2 = parse(lex(`(a * b) + (c / d) - e`));
  expect(ast).toEqual(ast2);

  expect(ast).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "left": Object {
        "left": Object {
          "left": Object {
            "tag": "identifier",
            "value": "a",
          },
          "operator": "*",
          "right": Object {
            "tag": "identifier",
            "value": "b",
          },
          "tag": "binaryOp",
        },
        "operator": "+",
        "right": Object {
          "left": Object {
            "tag": "identifier",
            "value": "c",
          },
          "operator": "/",
          "right": Object {
            "tag": "identifier",
            "value": "d",
          },
          "tag": "binaryOp",
        },
        "tag": "binaryOp",
      },
      "operator": "-",
      "right": Object {
        "tag": "identifier",
        "value": "e",
      },
      "tag": "binaryOp",
    },
    "tag": "expr",
  },
]
`);
});

it("does not parse invalid programs", () => {
  expect(() => {
    parse(lex(`let 123 = 123`));
  }).toThrowError(ParseError);
  expect(() => {
    parse(lex(`let x + y`));
  }).toThrowError(ParseError);
});

it("parses simple type constructors", () => {
  expect(parse(lex(`print(True)`))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "fields": Array [],
          "tag": "typeConstructor",
          "value": "True",
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "print",
      },
      "tag": "call",
    },
    "tag": "expr",
  },
]
`);
});

it("parses if statements", () => {
  const code = `
    if (x) { print(y) }
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "args": Array [
                  Object {
                    "tag": "identifier",
                    "value": "y",
                  },
                ],
                "expr": Object {
                  "tag": "identifier",
                  "value": "print",
                },
                "tag": "call",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "tag": "identifier",
            "value": "x",
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
});

it("parses if expressions", () => {
  const code = `
    if (x) { y } else if (a) { b } else { c } 
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
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
            "tag": "identifier",
            "value": "x",
          },
          "tag": "cond",
        },
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "b",
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "tag": "identifier",
            "value": "a",
          },
          "tag": "cond",
        },
      ],
      "elseBlock": Array [
        Object {
          "expr": Object {
            "tag": "identifier",
            "value": "c",
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

it("parses while statements", () => {
  const code = `while (x) { print(x) }`;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
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
            "value": "print",
          },
          "tag": "call",
        },
        "tag": "expr",
      },
    ],
    "expr": Object {
      "tag": "identifier",
      "value": "x",
    },
    "tag": "while",
  },
]
`);
});

it("parses comparison expressions", () => {
  const code = `a < b <= c > d >= e == f != g`;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "left": Object {
        "left": Object {
          "left": Object {
            "left": Object {
              "left": Object {
                "left": Object {
                  "tag": "identifier",
                  "value": "a",
                },
                "operator": "<",
                "right": Object {
                  "tag": "identifier",
                  "value": "b",
                },
                "tag": "binaryOp",
              },
              "operator": "<=",
              "right": Object {
                "tag": "identifier",
                "value": "c",
              },
              "tag": "binaryOp",
            },
            "operator": ">",
            "right": Object {
              "tag": "identifier",
              "value": "d",
            },
            "tag": "binaryOp",
          },
          "operator": ">=",
          "right": Object {
            "tag": "identifier",
            "value": "e",
          },
          "tag": "binaryOp",
        },
        "operator": "==",
        "right": Object {
          "tag": "identifier",
          "value": "f",
        },
        "tag": "binaryOp",
      },
      "operator": "!=",
      "right": Object {
        "tag": "identifier",
        "value": "g",
      },
      "tag": "binaryOp",
    },
    "tag": "expr",
  },
]
`);
});

it("parses function declarations without arguments", () => {
  const code = `
  func foo (): Void {
    return
  }
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [],
    "returnType": Object {
      "tag": "identifier",
      "value": "Void",
    },
    "tag": "func",
  },
]
`);
});

it("parses function declarations", () => {
  const code = `
    func foo (a: Int): Int {
      return a
    }
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "tag": "identifier",
          "value": "a",
        },
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "a",
        },
        "type": Object {
          "tag": "identifier",
          "value": "Int",
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "value": "Int",
    },
    "tag": "func",
  },
]
`);
});

it("rejects missing function type annotations", () => {
  expect(() => {
    parse(lex(`func foo (bar): Void {}`));
  }).toThrow();

  expect(() => {
    parse(lex(`func foo (bar: 1): Void {}`));
  }).toThrow();

  expect(() => {
    parse(lex(`func foo (bar: Int) {}`));
  }).toThrow();
});

it("parses func calls", () => {
  const code = `
    foo(bar(1,2), baz())
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "tag": "integer",
              "value": 1,
            },
            Object {
              "tag": "integer",
              "value": 2,
            },
          ],
          "expr": Object {
            "tag": "identifier",
            "value": "bar",
          },
          "tag": "call",
        },
        Object {
          "args": Array [],
          "expr": Object {
            "tag": "identifier",
            "value": "baz",
          },
          "tag": "call",
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

it("parses anonymous function literals", () => {
  const code = `
    |x| { x + x }
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "block": Array [
        Object {
          "expr": Object {
            "left": Object {
              "tag": "identifier",
              "value": "x",
            },
            "operator": "+",
            "right": Object {
              "tag": "identifier",
              "value": "x",
            },
            "tag": "binaryOp",
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
