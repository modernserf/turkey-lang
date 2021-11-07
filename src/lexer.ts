import { Token } from "./types";

// _: whitespace _: comment  1: number 2: identifier 3: typeIdentifier 4: operator
const pattern =
  /[ \t\n]+|\/\/[^\n]*|(0|[1-9][0-9]*(?:\.[0-9]+)?)|([_a-z][_a-zA-Z0-9]*)|([A-Z][_a-zA-Z0-9]*)|([+\-*/=(){}])/y;

export function lex(string: string): Token[] {
  const tokens: Token[] = [];
  let result: RegExpExecArray | null;
  pattern.lastIndex = 0;

  while ((result = pattern.exec(string))) {
    if (result[1]) {
      if (result[1].includes(".")) {
        tokens.push({ tag: "float", value: Number(result[1]) });
      } else {
        tokens.push({ tag: "integer", value: Number(result[1]) });
      }
    } else if (result[2]) {
      switch (result[2]) {
        case "print":
        case "let":
        case "do":
        case "if":
        case "else":
          tokens.push({ tag: result[2] });
          break;
        default:
          tokens.push({ tag: "identifier", value: result[2] });
      }
    } else if (result[3]) {
      tokens.push({ tag: "typeIdentifier", value: result[3] });
    } else if (result[4]) {
      switch (result[4]) {
        case "+":
        case "-":
        case "*":
        case "/":
        case "=":
        case "{":
        case "}":
        case "(":
        case ")":
          tokens.push({ tag: result[4] });
          break;
      }
    }
  }

  return tokens;
}
