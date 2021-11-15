import {
  Token,
  Stmt,
  Expr,
  Binding,
  ParseError,
  IfCase,
  TypeExpr,
  TypeBinding,
} from "./types";

interface IParseState {
  token(): Token;
  advance(): void;
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
    case "type": {
      state.advance();
      const binding = matchTypeBinding(state);
      match(state, "=");
      const type = matchType(state);
      return { tag: "type", binding, type };
    }
    case "print": {
      state.advance();
      match(state, "(");
      const expr = matchExpr(state);
      match(state, ")");
      return { tag: "print", expr };
    }
    case "let": {
      state.advance();
      const binding = matchBinding(state);
      let type = null;
      if (check(state, ":")) {
        type = matchType(state);
      }

      match(state, "=");
      const expr = matchExpr(state);
      return { tag: "let", binding, type, expr };
    }
    case "while": {
      state.advance();
      match(state, "(");
      const expr = matchExpr(state);
      match(state, ")");
      const block = parseBlock(state);
      return { tag: "while", expr, block };
    }
    case "return": {
      state.advance();
      const expr = checkExpr(state);
      return { tag: "return", expr };
    }
    case "func": {
      state.advance();
      const name = match(state, "identifier").value;
      match(state, "(");
      const parameters = commaList(state, checkFuncParam);
      match(state, ")");
      match(state, ":");
      const returnType = matchType(state);
      const block = parseBlock(state);
      return { tag: "func", name, parameters, returnType, block };
    }
    default:
      return { tag: "expr", expr: matchExpr(state) };
  }
};

const matchExpr: Parser<Expr> = (state) => {
  return assert(state, "expression", checkExpr(state));
};

const checkExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, parseAddExpr, ["==", "!=", ">", "<", "<=", ">="]);
};

const parseAddExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, parseMulExpr, ["+", "-"]);
};

const parseMulExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, parsePrefixExpr, ["*", "/", "%"]);
};

const parsePrefixExpr: Parser<Expr | null> = (state) => {
  const tok = state.token();
  if (tok.tag === "!" || tok.tag === "-") {
    state.advance();
    const expr = assert(state, "expression", parsePrefixExpr(state));
    return { tag: "unaryOp", operator: tok.tag, expr };
  } else {
    return parsePostfixExpr(state);
  }
};

const parsePostfixExpr: Parser<Expr | null> = (state) => {
  let expr = parseBaseExpr(state);
  if (!expr) return null;

  while (true) {
    const token = state.token();
    switch (token.tag) {
      case "(": {
        state.advance();
        const args = commaList(state, checkExpr);
        match(state, ")");
        expr = { tag: "call", expr, args };
        break;
      }
      default:
        return expr;
    }
  }
};

const parseBaseExpr: Parser<Expr | null> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "(": {
      state.advance();
      const expr = matchExpr(state);
      match(state, ")");
      return expr;
    }
    case "typeIdentifier":
      state.advance();
      return { tag: "typeConstructor", value: token.value };
    case "identifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    case "float":
      state.advance();
      return { tag: "float", value: token.value };
    case "integer":
      state.advance();
      return { tag: "integer", value: token.value };
    case "string":
      state.advance();
      return { tag: "string", value: token.value };
    case "|": {
      state.advance();
      const parameters = commaList(state, checkBinding);
      match(state, "|");
      const block = parseBlock(state);
      return { tag: "closure", parameters, block };
    }
    case "do":
      state.advance();
      return { tag: "do", block: parseBlock(state) };
    case "if": {
      state.advance();
      const cases: IfCase[] = [];
      while (true) {
        match(state, "(");
        const predicate = matchExpr(state);
        match(state, ")");
        const block = parseBlock(state);
        cases.push({ tag: "cond", predicate, block });
        if (check(state, "else")) {
          if (check(state, "if")) continue;
          const elseBlock = parseBlock(state);
          return { tag: "if", cases, elseBlock };
        } else {
          return { tag: "if", cases, elseBlock: [] };
        }
      }
    }
    default:
      return null;
  }
};

const matchBinding: Parser<Binding> = (state) => {
  return assert(state, "binding", checkBinding(state));
};

const checkBinding: Parser<Binding | null> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "identifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    default:
      return null;
  }
};

const matchTypeBinding: Parser<TypeBinding> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "typeIdentifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    default:
      throw new ParseError("type binding", token);
  }
};

const matchType: Parser<TypeExpr> = (state) => {
  return assert(state, "type", checkType(state));
};

const checkType: Parser<TypeExpr | null> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "typeIdentifier":
      state.advance();
      return { tag: "identifier", value: token.value };
    case "func": {
      state.advance();
      match(state, "(");
      const parameters = commaList(state, checkType);
      match(state, ")");
      match(state, ":");
      const returnType = matchType(state);
      return { tag: "func", parameters, returnType };
    }
    default:
      return null;
  }
};

const checkFuncParam: Parser<{ binding: Binding; type: TypeExpr } | null> = (
  state
) => {
  const binding = checkBinding(state);
  if (!binding) return null;
  match(state, ":");
  const type = matchType(state);
  return { binding, type };
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

function match<Tag extends Token["tag"]>(
  state: IParseState,
  tag: Tag
): Token & { tag: Tag } {
  const token = state.token();
  if (token.tag === tag) {
    state.advance();
    return token as Token & { tag: Tag };
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
  nextParser: Parser<Expr | null>,
  operators: Token["tag"][]
): Expr | null {
  const first = nextParser(state);
  if (!first) return null;
  let left: Expr = first;
  while (true) {
    const operator = state.token().tag;
    if (!operators.includes(operator)) {
      break;
    }
    state.advance();
    const right = assert(state, "expression", nextParser(state));
    left = { tag: "binaryOp", left, right, operator };
  }
  return left;
}

function commaList<T>(state: IParseState, checkParser: Parser<T | null>): T[] {
  const out: T[] = [];
  while (true) {
    const res = checkParser(state);
    if (res === null) break;
    out.push(res);
    if (!check(state, ",")) break;
  }
  return out;
}

function assert<T>(state: IParseState, type: string, res: T | null) {
  if (!res) {
    throw new ParseError(type, state.token());
  }
  return res;
}
