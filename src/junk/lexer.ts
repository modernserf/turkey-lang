import moo from "moo";

// prettier-ignore
export const keywords = new Set([
  'let', 'for', 'in', 'while', 'return', 'break', 'continue', 'func', 
  'type', 'enum', 'struct', 'impl', 'module', 'import', 'from', 'as',
  'if', 'else', 'match', 'case',
])

// prettier-ignore
const operators = Object.fromEntries([
  '(', ')', '{', '}', '[', ']', '|', '#[',
  '.', '::', ':', ',', ';',  '=>',
  '+', '-', '*', '/', '**', '!', '||', '&&', '=',
  '==', '!=', '<', '<=', '>', '>=',
].map(op => [op, op]))

const lexer = moo.compile({
  whitespace: { match: /[ \t\n]+/, lineBreaks: true },
  comment: /\/\/[^\n]*/,
  number: /0|[1-9][0-9]*(?:\.[0-9]+)?/,

  string: /"(?:\\["\\]|[^\n"\\])*"/,
  identifier: {
    match: /[_a-z][a-zA-Z0-9]*/,
    type: (value) => (keywords.has(value) ? value : "identifier"),
  },
  typeIdentifier: /[A-Z][a-zA-Z0-9]*/,
  ...operators,
});

export function lex(string: string): moo.Token[] {
  return Array.from(lexer.reset(string)).filter(
    (token) => token.type !== "whitespace" && token.type !== "comment"
  );
}
