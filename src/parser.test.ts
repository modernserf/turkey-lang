import { parse } from "./parser";
import { lex } from "./lexer";
import { ParseError } from "./types";

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
    parse(tokens);
  }).toThrowError(ParseError);
});

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
      "typeArgs": Array [],
      "value": "Void",
    },
    "tag": "func",
    "typeParameters": Array [],
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
          "typeArgs": Array [],
          "value": "Int",
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "Int",
    },
    "tag": "func",
    "typeParameters": Array [],
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

it("has tagged variants", () => {
  const code = `
    enum IntOption {
      None,
      Some(Int),
    }

    match (val) {
      None => print("None"),
      Some(x) => {
        print(x)
      },
    }
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "IntOption",
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
              "value": "Int",
            },
          },
        ],
        "isTuple": true,
        "tagName": "Some",
      },
    ],
    "tag": "enum",
  },
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "binding": Object {
            "fields": Array [],
            "tag": "typeIdentifier",
            "value": "None",
          },
          "block": Array [
            Object {
              "expr": Object {
                "args": Array [
                  Object {
                    "tag": "string",
                    "value": "None",
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
        },
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
            "value": "Some",
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
                  "value": "print",
                },
                "tag": "call",
              },
              "tag": "expr",
            },
          ],
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "val",
      },
      "tag": "match",
    },
    "tag": "expr",
  },
]
`);
});

it("has tagged variants with named fields", () => {
  const code = `
    enum Expr {
      AddExpr { left: Expr, right: Expr },
      IntExpr { value: Int },
    }

    match (val) {
      AddExpr { left: left, right: right } => left + right,
      IntExpr { value: value } => value,
    }
  `;

  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [],
      "value": "Expr",
    },
    "cases": Array [
      Object {
        "fields": Array [
          Object {
            "fieldName": "left",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Expr",
            },
          },
          Object {
            "fieldName": "right",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Expr",
            },
          },
        ],
        "isTuple": false,
        "tagName": "AddExpr",
      },
      Object {
        "fields": Array [
          Object {
            "fieldName": "value",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "Int",
            },
          },
        ],
        "isTuple": false,
        "tagName": "IntExpr",
      },
    ],
    "tag": "enum",
  },
  Object {
    "expr": Object {
      "cases": Array [
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
            "value": "AddExpr",
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
        Object {
          "binding": Object {
            "fields": Array [
              Object {
                "binding": Object {
                  "tag": "identifier",
                  "value": "value",
                },
                "fieldName": "value",
              },
            ],
            "tag": "typeIdentifier",
            "value": "IntExpr",
          },
          "block": Array [
            Object {
              "expr": Object {
                "tag": "identifier",
                "value": "value",
              },
              "tag": "expr",
            },
          ],
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "val",
      },
      "tag": "match",
    },
    "tag": "expr",
  },
]
`);
});

it("rejects invalid pattern matches", () => {
  const code = `
    match (foo) {
      1 => 1
    }
  `;

  expect(() => parse(lex(code))).toThrow();
});

it("rejects invalid enum/struct bindings", () => {
  expect(() => parse(lex(`enum 1 {}`))).toThrow();
});

it("allows empty type constructions", () => {
  const code = `
    Foo {}  
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "fields": Array [],
      "tag": "typeConstructor",
      "value": "Foo",
    },
    "tag": "expr",
  },
]
`);
});

it("allows empty pattern matches", () => {
  const code = `
    match (foo) {
      Tag {} => 1,
    } 
  `;

  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "cases": Array [
        Object {
          "binding": Object {
            "fields": Array [],
            "tag": "typeIdentifier",
            "value": "Tag",
          },
          "block": Array [
            Object {
              "expr": Object {
                "tag": "integer",
                "value": 1,
              },
              "tag": "expr",
            },
          ],
        },
      ],
      "expr": Object {
        "tag": "identifier",
        "value": "foo",
      },
      "tag": "match",
    },
    "tag": "expr",
  },
]
`);
});

it("parses type parameters", () => {
  const code = `
    enum List<T> {
      Cons(T, List<T>),
      Nil,
    }
    func foo<T> (
      list: List<T>, 
      fn: func <U>(T, U): T
    ): T {}
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "typeParameters": Array [
        Object {
          "tag": "identifier",
          "value": "T",
        },
      ],
      "value": "List",
    },
    "cases": Array [
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
          Object {
            "fieldName": "1",
            "type": Object {
              "tag": "identifier",
              "typeArgs": Array [
                Object {
                  "tag": "identifier",
                  "typeArgs": Array [],
                  "value": "T",
                },
              ],
              "value": "List",
            },
          },
        ],
        "isTuple": true,
        "tagName": "Cons",
      },
      Object {
        "fields": Array [],
        "isTuple": false,
        "tagName": "Nil",
      },
    ],
    "tag": "enum",
  },
  Object {
    "block": Array [],
    "name": "foo",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "list",
        },
        "type": Object {
          "tag": "identifier",
          "typeArgs": Array [
            Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "T",
            },
          ],
          "value": "List",
        },
      },
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "fn",
        },
        "type": Object {
          "parameters": Array [
            Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "T",
            },
            Object {
              "tag": "identifier",
              "typeArgs": Array [],
              "value": "U",
            },
          ],
          "returnType": Object {
            "tag": "identifier",
            "typeArgs": Array [],
            "value": "T",
          },
          "tag": "func",
          "typeParameters": Array [
            Object {
              "tag": "identifier",
              "value": "U",
            },
          ],
        },
      },
    ],
    "returnType": Object {
      "tag": "identifier",
      "typeArgs": Array [],
      "value": "T",
    },
    "tag": "func",
    "typeParameters": Array [
      Object {
        "tag": "identifier",
        "value": "T",
      },
    ],
  },
]
`);
});

it("parses empty parameter lists? sure, why not", () => {
  const code = `
    struct Foo<> {}
  `;
  expect(parse(lex(code))).toMatchInlineSnapshot(`
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
});
