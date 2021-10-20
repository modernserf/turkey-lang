import moo from "moo";

const lexer = moo.compile({
  whitespace: /[ \t]+/,
  comment: /\/\/[^\n]*/,
  number: {
    match: /0|[1-9][0-9]*(?:\.[0-9]+)?/,
    value: (val) => Number(val) as any,
  },
  string: {
    match: /"(?:\\["\\]|[^\n"\\])*"/,
    value: (str) => str.slice(1, -1),
  },
  identifier: {
    match: /[_a-z][a-zA-Z0-9]*/,
    type: moo.keywords({
      // prettier-ignore
      keyword: [
        'let', 'for', 'in', 'while', 'return',  'break', 'continue', 'func', 
        'type', 'enum', 'struct', 'impl', 'module', 'import', 'from', 'as',
        'if', 'else', 'match', 'case'
      ],
    }),
  },
  typeIdentifier: /[A-Z][a-zA-Z0-9]*/,
  // prettier-ignore
  operator: [
    '(', ')', '{', '}', '[', ']', '|',
    '.', '::', ':', ',', ';',
    '+', '-', '*', '/', '**', '!', '||', '&&', '=',
    '==', '!=', '<', '<=', '>', '>='
  ],
  line: { match: /\n/, lineBreaks: true },
});

export function lex(string: string) {
  return Array.from(lexer.reset(string)).filter(
    (token) => token.type !== "whitespace" && token.type !== "comment"
  );
}
