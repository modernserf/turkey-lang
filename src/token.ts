export type Token =
  | { tag: "let" }
  | { tag: "do" }
  | { tag: "if" }
  | { tag: "else" }
  | { tag: "for" }
  | { tag: "in" }
  | { tag: "while" }
  | { tag: "func" }
  | { tag: "return" }
  | { tag: "type" }
  | { tag: "enum" }
  | { tag: "struct" }
  | { tag: "match" }
  | { tag: "trait" }
  | { tag: "impl" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "typeIdentifier"; value: string }
  | { tag: "==" }
  | { tag: "!=" }
  | { tag: "<=" }
  | { tag: ">=" }
  | { tag: "=>" }
  | { tag: "&&" }
  | { tag: "||" }
  | { tag: "^^" }
  | { tag: "!" }
  | { tag: "+" }
  | { tag: "-" }
  | { tag: "*" }
  | { tag: "/" }
  | { tag: "%" }
  | { tag: "=" }
  | { tag: "<" }
  | { tag: ">" }
  | { tag: "(" }
  | { tag: ")" }
  | { tag: "{" }
  | { tag: "}" }
  | { tag: "[" }
  | { tag: "]" }
  | { tag: ":" }
  | { tag: "," }
  | { tag: "|" }
  | { tag: "." }
  | { tag: ";" }
  | { tag: "error"; value: string }
  | { tag: "endOfInput" };
