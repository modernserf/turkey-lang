import { lex } from "./lexer";

it("has a lexer", () => {
  const code = `let x = lettuce(123.45, "hello") // a comment`;
  const tokens = lex(code);
  expect(tokens).toMatchObject([
    { type: "keyword", value: "let" },
    { type: "identifier", value: "x" },
    { type: "operator", value: "=" },
    { type: "identifier", value: "lettuce" },
    { type: "operator", value: "(" },
    { type: "number", value: 123.45 },
    { type: "operator", value: "," },
    { type: "string", value: "hello" },
    { type: "operator", value: ")" },
  ]);
});
