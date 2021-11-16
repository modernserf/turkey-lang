import { check as checkAST } from "./check-types";
import { parse } from "./parser";
import { lex } from "./lexer";

function check(program: string) {
  return checkAST(parse(lex(program)));
}

it("checks types", () => {
  const code = `
    let a = 1
    let b = 1.5
    print(a + 2)
    print(b + 2.5)
    while (True) {
      if (False) {} else if (False) {
        print(-a)
      } else {
        print(do {
          !True
        })
      }
    }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "a",
    },
    "expr": Object {
      "tag": "primitive",
      "type": Object {
        "tag": "integer",
      },
      "value": 1,
    },
    "tag": "let",
  },
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "b",
    },
    "expr": Object {
      "tag": "primitive",
      "type": Object {
        "tag": "float",
      },
      "value": 1.5,
    },
    "tag": "let",
  },
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "integer",
              },
              "value": "a",
            },
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 2,
            },
          ],
          "opcode": 17,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "integer",
          },
        },
      ],
      "opcode": 33,
      "tag": "callBuiltIn",
      "type": Object {
        "tag": "void",
      },
    },
    "tag": "expr",
  },
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "float",
              },
              "value": "b",
            },
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "float",
              },
              "value": 2.5,
            },
          ],
          "opcode": 17,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "float",
          },
        },
      ],
      "opcode": 33,
      "tag": "callBuiltIn",
      "type": Object {
        "tag": "void",
      },
    },
    "tag": "expr",
  },
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "cases": Array [
            Object {
              "block": Array [],
              "predicate": Object {
                "tag": "primitive",
                "type": Object {
                  "cases": Array [
                    Object {
                      "fields": Array [],
                      "tag": "False",
                    },
                    Object {
                      "fields": Array [],
                      "tag": "True",
                    },
                  ],
                  "tag": "enum",
                  "value": Symbol(Boolean),
                },
                "value": 0,
              },
            },
            Object {
              "block": Array [
                Object {
                  "expr": Object {
                    "args": Array [
                      Object {
                        "args": Array [
                          Object {
                            "tag": "identifier",
                            "type": Object {
                              "tag": "integer",
                            },
                            "value": "a",
                          },
                        ],
                        "opcode": 22,
                        "tag": "callBuiltIn",
                        "type": Object {
                          "tag": "integer",
                        },
                      },
                    ],
                    "opcode": 33,
                    "tag": "callBuiltIn",
                    "type": Object {
                      "tag": "void",
                    },
                  },
                  "tag": "expr",
                },
              ],
              "predicate": Object {
                "tag": "primitive",
                "type": Object {
                  "cases": Array [
                    Object {
                      "fields": Array [],
                      "tag": "False",
                    },
                    Object {
                      "fields": Array [],
                      "tag": "True",
                    },
                  ],
                  "tag": "enum",
                  "value": Symbol(Boolean),
                },
                "value": 0,
              },
            },
          ],
          "elseBlock": Array [
            Object {
              "expr": Object {
                "args": Array [
                  Object {
                    "block": Array [
                      Object {
                        "expr": Object {
                          "args": Array [
                            Object {
                              "tag": "primitive",
                              "type": Object {
                                "cases": Array [
                                  Object {
                                    "fields": Array [],
                                    "tag": "False",
                                  },
                                  Object {
                                    "fields": Array [],
                                    "tag": "True",
                                  },
                                ],
                                "tag": "enum",
                                "value": Symbol(Boolean),
                              },
                              "value": 1,
                            },
                          ],
                          "opcode": 32,
                          "tag": "callBuiltIn",
                          "type": Object {
                            "cases": Array [
                              Object {
                                "fields": Array [],
                                "tag": "False",
                              },
                              Object {
                                "fields": Array [],
                                "tag": "True",
                              },
                            ],
                            "tag": "enum",
                            "value": Symbol(Boolean),
                          },
                        },
                        "tag": "expr",
                      },
                    ],
                    "tag": "do",
                    "type": Object {
                      "cases": Array [
                        Object {
                          "fields": Array [],
                          "tag": "False",
                        },
                        Object {
                          "fields": Array [],
                          "tag": "True",
                        },
                      ],
                      "tag": "enum",
                      "value": Symbol(Boolean),
                    },
                  },
                ],
                "opcode": 33,
                "tag": "callBuiltIn",
                "type": Object {
                  "tag": "void",
                },
              },
              "tag": "expr",
            },
          ],
          "tag": "if",
          "type": Object {
            "tag": "void",
          },
        },
        "tag": "expr",
      },
    ],
    "expr": Object {
      "tag": "primitive",
      "type": Object {
        "cases": Array [
          Object {
            "fields": Array [],
            "tag": "False",
          },
          Object {
            "fields": Array [],
            "tag": "True",
          },
        ],
        "tag": "enum",
        "value": Symbol(Boolean),
      },
      "value": 1,
    },
    "tag": "while",
  },
]
`);
});

it("checks operators", () => {
  const code = `(1 + 2 * 3 - 4) / 5`;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "expr": Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "args": Array [
                Object {
                  "tag": "primitive",
                  "type": Object {
                    "tag": "integer",
                  },
                  "value": 1,
                },
                Object {
                  "args": Array [
                    Object {
                      "tag": "primitive",
                      "type": Object {
                        "tag": "integer",
                      },
                      "value": 2,
                    },
                    Object {
                      "tag": "primitive",
                      "type": Object {
                        "tag": "integer",
                      },
                      "value": 3,
                    },
                  ],
                  "opcode": 19,
                  "tag": "callBuiltIn",
                  "type": Object {
                    "tag": "integer",
                  },
                },
              ],
              "opcode": 17,
              "tag": "callBuiltIn",
              "type": Object {
                "tag": "integer",
              },
            },
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 4,
            },
          ],
          "opcode": 18,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "integer",
          },
        },
        Object {
          "tag": "primitive",
          "type": Object {
            "tag": "integer",
          },
          "value": 5,
        },
      ],
      "opcode": 20,
      "tag": "callBuiltIn",
      "type": Object {
        "tag": "float",
      },
    },
    "tag": "expr",
  },
]
`);
});

it("rejects unknown variables", () => {
  expect(() => {
    check(`print(x)`);
  }).toThrow();
});

it("rejects unknown type constructors", () => {
  expect(() => {
    check(`print(What)`);
  }).toThrow();
});

it("typechecks math", () => {
  expect(() => {
    check(`print(1.5 + 2)`);
  }).toThrow();

  expect(() => {
    check(`print(True + False)`);
  }).toThrow();
});

it("enforces type matching between conditional branches", () => {
  const code = `
    let x = if (True) {
      1
    } else {
      1.0
    }
    print(x)
  `;

  expect(() => check(code)).toThrow();
});

it("forbids returning from top level", () => {
  const code = `
    return 1
  `;
  expect(() => check(code)).toThrow();
});

it("forbids unknown types", () => {
  const code = `
    func get_x (): Nope {
      return 1
    }
  `;
  expect(() => check(code)).toThrow();
});

it("checks functions", () => {
  const code = `
    func foo (): Void {
      print(1)
    }
  `;

  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 1,
            },
          ],
          "opcode": 33,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "void",
          },
        },
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [],
    "tag": "func",
    "type": Object {
      "parameters": Array [],
      "returnType": Object {
        "tag": "void",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);
});

it("checks functions that explicitly return void", () => {
  const code = `
  func foo (): Void {
    print(1)
    return
  }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 1,
            },
          ],
          "opcode": 33,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "void",
          },
        },
        "tag": "expr",
      },
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [],
    "tag": "func",
    "type": Object {
      "parameters": Array [],
      "returnType": Object {
        "tag": "void",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);
});

it("checks functions that implicitly return void", () => {
  const code = `
  func foo (): Void {
    while (True) {
      print(0)
    }
  }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "block": Array [
          Object {
            "expr": Object {
              "args": Array [
                Object {
                  "tag": "primitive",
                  "type": Object {
                    "tag": "integer",
                  },
                  "value": 0,
                },
              ],
              "opcode": 33,
              "tag": "callBuiltIn",
              "type": Object {
                "tag": "void",
              },
            },
            "tag": "expr",
          },
        ],
        "expr": Object {
          "tag": "primitive",
          "type": Object {
            "cases": Array [
              Object {
                "fields": Array [],
                "tag": "False",
              },
              Object {
                "fields": Array [],
                "tag": "True",
              },
            ],
            "tag": "enum",
            "value": Symbol(Boolean),
          },
          "value": 1,
        },
        "tag": "while",
      },
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "foo",
    "parameters": Array [],
    "tag": "func",
    "type": Object {
      "parameters": Array [],
      "returnType": Object {
        "tag": "void",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);
});

it("checks functions that implicitly return values", () => {
  const code = `
  func add_one (x: Int): Int {
    x + 1
  }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "integer",
              },
              "value": "x",
            },
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 1,
            },
          ],
          "opcode": 17,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "integer",
          },
        },
        "tag": "return",
      },
    ],
    "name": "add_one",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "x",
        },
        "type": Object {
          "tag": "integer",
        },
      },
    ],
    "tag": "func",
    "type": Object {
      "parameters": Array [
        Object {
          "tag": "integer",
        },
      ],
      "returnType": Object {
        "tag": "integer",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);
});

it("checks closures", () => {
  const code = `
  let y = 1
  func add_y (x: Int): Int {
    x + y
  }`;

  const result: any = check(code);
  expect(result[1].upvalues[0].name).toEqual("y");
  expect(result).toMatchInlineSnapshot(`
Array [
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "y",
    },
    "expr": Object {
      "tag": "primitive",
      "type": Object {
        "tag": "integer",
      },
      "value": 1,
    },
    "tag": "let",
  },
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "integer",
              },
              "value": "x",
            },
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "integer",
              },
              "value": "y",
            },
          ],
          "opcode": 17,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "integer",
          },
        },
        "tag": "return",
      },
    ],
    "name": "add_y",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "x",
        },
        "type": Object {
          "tag": "integer",
        },
      },
    ],
    "tag": "func",
    "type": Object {
      "parameters": Array [
        Object {
          "tag": "integer",
        },
      ],
      "returnType": Object {
        "tag": "integer",
      },
      "tag": "func",
    },
    "upvalues": Array [
      Object {
        "name": "y",
        "type": Object {
          "tag": "integer",
        },
      },
    ],
  },
]
`);
});

it("checks closures with nested upvalues", () => {
  const code = `
  let y = 1
  func add_y (x: Int): Int {
    func add(): Int {
      x + y
    }
    return add()
  }`;

  const result: any = check(code);
  expect(result[1].upvalues[0].name).toEqual("y");
  expect(result[1].block[0].upvalues[0].name).toEqual("x");
  expect(result[1].block[0].upvalues[1].name).toEqual("y");
});

it("checks funcs with implicit void returns", () => {
  const code = `
  func loop (): Void {
    while (True) {
      print(1)
    }
  }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "block": Array [
          Object {
            "expr": Object {
              "args": Array [
                Object {
                  "tag": "primitive",
                  "type": Object {
                    "tag": "integer",
                  },
                  "value": 1,
                },
              ],
              "opcode": 33,
              "tag": "callBuiltIn",
              "type": Object {
                "tag": "void",
              },
            },
            "tag": "expr",
          },
        ],
        "expr": Object {
          "tag": "primitive",
          "type": Object {
            "cases": Array [
              Object {
                "fields": Array [],
                "tag": "False",
              },
              Object {
                "fields": Array [],
                "tag": "True",
              },
            ],
            "tag": "enum",
            "value": Symbol(Boolean),
          },
          "value": 1,
        },
        "tag": "while",
      },
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "loop",
    "parameters": Array [],
    "tag": "func",
    "type": Object {
      "parameters": Array [],
      "returnType": Object {
        "tag": "void",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);

  const code2 = `func noop(): Void {}`;
  expect(check(code2)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": null,
        "tag": "return",
      },
    ],
    "name": "noop",
    "parameters": Array [],
    "tag": "func",
    "type": Object {
      "parameters": Array [],
      "returnType": Object {
        "tag": "void",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
]
`);
});

it("checks function calls", () => {
  const code = `
    func add_one (x: Int): Int {
      x + 1
    }
    let a = if (True) { add_one(1) } else { add_one(2) }
  `;
  expect(check(code)).toMatchInlineSnapshot(`
Array [
  Object {
    "block": Array [
      Object {
        "expr": Object {
          "args": Array [
            Object {
              "tag": "identifier",
              "type": Object {
                "tag": "integer",
              },
              "value": "x",
            },
            Object {
              "tag": "primitive",
              "type": Object {
                "tag": "integer",
              },
              "value": 1,
            },
          ],
          "opcode": 17,
          "tag": "callBuiltIn",
          "type": Object {
            "tag": "integer",
          },
        },
        "tag": "return",
      },
    ],
    "name": "add_one",
    "parameters": Array [
      Object {
        "binding": Object {
          "tag": "identifier",
          "value": "x",
        },
        "type": Object {
          "tag": "integer",
        },
      },
    ],
    "tag": "func",
    "type": Object {
      "parameters": Array [
        Object {
          "tag": "integer",
        },
      ],
      "returnType": Object {
        "tag": "integer",
      },
      "tag": "func",
    },
    "upvalues": Array [],
  },
  Object {
    "binding": Object {
      "tag": "identifier",
      "value": "a",
    },
    "expr": Object {
      "cases": Array [
        Object {
          "block": Array [
            Object {
              "expr": Object {
                "args": Array [
                  Object {
                    "tag": "primitive",
                    "type": Object {
                      "tag": "integer",
                    },
                    "value": 1,
                  },
                ],
                "callee": Object {
                  "tag": "identifier",
                  "type": Object {
                    "parameters": Array [
                      Object {
                        "tag": "integer",
                      },
                    ],
                    "returnType": Object {
                      "tag": "integer",
                    },
                    "tag": "func",
                  },
                  "value": "add_one",
                },
                "tag": "call",
                "type": Object {
                  "tag": "integer",
                },
              },
              "tag": "expr",
            },
          ],
          "predicate": Object {
            "tag": "primitive",
            "type": Object {
              "cases": Array [
                Object {
                  "fields": Array [],
                  "tag": "False",
                },
                Object {
                  "fields": Array [],
                  "tag": "True",
                },
              ],
              "tag": "enum",
              "value": Symbol(Boolean),
            },
            "value": 1,
          },
        },
      ],
      "elseBlock": Array [
        Object {
          "expr": Object {
            "args": Array [
              Object {
                "tag": "primitive",
                "type": Object {
                  "tag": "integer",
                },
                "value": 2,
              },
            ],
            "callee": Object {
              "tag": "identifier",
              "type": Object {
                "parameters": Array [
                  Object {
                    "tag": "integer",
                  },
                ],
                "returnType": Object {
                  "tag": "integer",
                },
                "tag": "func",
              },
              "value": "add_one",
            },
            "tag": "call",
            "type": Object {
              "tag": "integer",
            },
          },
          "tag": "expr",
        },
      ],
      "tag": "if",
      "type": Object {
        "tag": "integer",
      },
    },
    "tag": "let",
  },
]
`);
});

it("rejects invalid function calls", () => {
  expect(() => {
    check(`
      func foo (): Void {}
      foo(1)
    `);
  }).toThrow();
  expect(() => {
    check(`
      func foo (x: Boolean): Void {}
      foo()
    `);
  }).toThrow();
  expect(() => {
    check(`
      func foo (x: Float): Void {}
      foo(1)
    `);
  }).toThrow();
  expect(() => {
    check(`
      let foo = 1
      foo()
    `);
  }).toThrow();
});
