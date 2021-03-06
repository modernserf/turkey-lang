import { Token } from "./token";

// _: whitespace _: comment  1: number 2: identifier 3: typeIdentifier 4: operator 5: string 6: error
const pattern =
  /[ \t\n]+|\/\/[^\n]*|((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)|([_a-z][_a-zA-Z0-9]*)|([A-Z][_a-zA-Z0-9]*)|(==|!=|<=|>=|&&|\|\||\^\^|=>|[.|,;:!+\-*/%=<>(){}[\]])|"((?:[^"]|\\")*)"|(.)/y;

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
        case "let":
        case "do":
        case "if":
        case "else":
        case "for":
        case "in":
        case "while":
        case "func":
        case "return":
        case "type":
        case "enum":
        case "struct":
        case "match":
        case "trait":
        case "impl":
          tokens.push({ tag: result[2] });
          break;
        default:
          tokens.push({ tag: "identifier", value: result[2] });
      }
    } else if (result[3]) {
      tokens.push({ tag: "typeIdentifier", value: result[3] });
    } else if (result[4]) {
      tokens.push({ tag: result[4] as any });
    } else if (result[5] !== undefined) {
      tokens.push({ tag: "string", value: result[5] });
    } else if (result[6] !== undefined) {
      tokens.push({ tag: "error", value: result[6] });
    }
  }

  return tokens;
}
