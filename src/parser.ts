import { Token, Stmt, Expr, Binding, ParseError } from "./types";

interface IParseState {
  token(): Token;
  advance(): void;
  // save(): number;
  // reset(num: number): void;
}

type Parser<T> = (state: IParseState) => T;

const endOfInput: Token = { tag: "endOfInput" };
class ParseState implements IParseState {
  private index = 0;
  constructor(private tokens: Token[]) {}
  token(): Token {
    return this.tokens[this.index] ?? endOfInput;
  }
  advance(): void {
    this.index++;
  }
}

export function parse(input: Token[]): Stmt[] {
  return parseProgram(new ParseState(input));
}

const parseProgram: Parser<Stmt[]> = (state) => {
  return parseUntil(state, parseStatement, parseEndOfInput);
};

const parseStatement: Parser<Stmt> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "print":
      state.advance();
      return { tag: "print", expr: parseExpr(state) };
    case "let": {
      state.advance();
      const binding = parseBinding(state);
      match(state, "=");
      const expr = parseExpr(state);
      return { tag: "let", binding, type: null, expr };
    }
    default:
      return { tag: "expr", expr: parseExpr(state) };
  }
};

const parseExpr: Parser<Expr> = (state) => {
  return infixLeft(state, parseBaseExpr, ["+"]);
};

const parseBaseExpr: Parser<Expr> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "identifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    case "float":
      state.advance();
      return { tag: "float", value: token.value };
    case "integer":
      state.advance();
      return { tag: "integer", value: token.value };
    case "do":
      state.advance();
      return { tag: "do", block: parseBlock(state) };
    default:
      throw new ParseError("expression", token);
  }
};

const parseBinding: Parser<Binding> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "identifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    default:
      throw new ParseError("binding", token);
  }
};

const parseEndOfInput: Parser<boolean> = (state) => {
  return !!check(state, "endOfInput");
};

// utilities

function check(state: IParseState, tag: Token["tag"]): Token | null {
  const token = state.token();
  if (token.tag === tag) {
    state.advance();
    return token;
  } else {
    return null;
  }
}

function match(state: IParseState, tag: Token["tag"]): Token {
  const token = state.token();
  if (token.tag === tag) {
    state.advance();
    return token;
  } else {
    throw new ParseError(tag, token);
  }
}

function checkEndBrace(state: IParseState): boolean {
  return !!check(state, "}");
}
const parseBlock: Parser<Stmt[]> = (state) => {
  match(state, "{");
  return parseUntil(state, parseStatement, checkEndBrace);
};

function parseUntil<T>(
  state: IParseState,
  parseValue: Parser<T>,
  parseEnd: Parser<boolean>
): T[] {
  const out: T[] = [];
  while (!parseEnd(state)) {
    out.push(parseValue(state));
  }
  return out;
}

function infixLeft(
  state: IParseState,
  nextParser: Parser<Expr>,
  operators: Token["tag"][]
): Expr {
  let left = nextParser(state);
  while (true) {
    const operator = state.token().tag;
    if (!operators.includes(operator)) {
      break;
    }
    state.advance();
    const right = nextParser(state);
    left = { tag: "binaryOp", left, right, operator };
  }
  return left;
}
