import {
  Token,
  Stmt,
  Expr,
  Binding,
  ParseError,
  IfCase,
  TypeExpr,
  TypeBinding,
  EnumCase,
  StructFieldType,
  StructFieldValue,
  MatchCase,
  StructFieldBinding,
  MatchBinding,
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
    case "enum": {
      state.advance();
      const binding = matchTypeBinding(state);
      match(state, "{");
      const cases = commaList(state, checkEnumCase);
      match(state, "}");
      return { tag: "enum", binding, cases };
    }
    case "struct": {
      state.advance();
      const binding = matchTypeBinding(state);
      const fields = matchStructFieldTypeList(state);
      return { tag: "struct", binding, fields };
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
      case ":": {
        state.advance();
        const fieldName = assert(state, "field", checkField(state));
        expr = { tag: "field", expr, fieldName };
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
    case "typeIdentifier": {
      state.advance();
      const fields = matchStructFieldValueList(state);
      return { tag: "typeConstructor", value: token.value, fields };
    }
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
    case "match": {
      state.advance();
      match(state, "(");
      const expr = matchExpr(state);
      match(state, ")");

      match(state, "{");
      const cases = commaList(state, checkMatchCase);
      match(state, "}");
      return { tag: "match", expr, cases };
    }
    default:
      return null;
  }
};

const checkMatchCase: Parser<MatchCase | null> = (state) => {
  const enumTag = check(state, "typeIdentifier");
  if (!enumTag) return null;
  const fields = matchStructFieldBindingList(state);
  match(state, "=>");
  const binding: MatchBinding = {
    tag: "typeIdentifier",
    value: enumTag.value,
    fields,
  };
  if (state.token().tag === "{") {
    const block = parseBlock(state);
    return { binding, block };
  } else {
    const expr = matchExpr(state);
    return { binding, block: [{ tag: "expr", expr }] };
  }
};

const matchStructFieldBindingList: Parser<StructFieldBinding[]> = (state) => {
  if (check(state, "{")) {
    const fields = commaList(state, checkStructFieldBinding);
    match(state, "}");
    return fields;
  } else if (check(state, "(")) {
    const fields = commaList(state, checkBinding);
    match(state, ")");
    return fields.map((binding, i) => ({ fieldName: String(i), binding }));
  } else {
    return [];
  }
};

const checkStructFieldBinding: Parser<StructFieldBinding | null> = (state) => {
  const fieldName = checkField(state);
  if (!fieldName) return null;
  if (check(state, ":")) {
    const binding = matchBinding(state);
    return { fieldName, binding };
  } else {
    return { fieldName, binding: { tag: "identifier", value: fieldName } };
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
    case "{":
    case "(": {
      const fields = matchStructFieldBindingList(state);
      return { tag: "struct", fields };
    }
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

const checkEnumCase: Parser<EnumCase | null> = (state) => {
  const tagName = check(state, "typeIdentifier");
  if (!tagName) return null;
  const fields = matchStructFieldTypeList(state);
  return { tagName: tagName.value, fields };
};

const matchStructFieldTypeList: Parser<StructFieldType[]> = (state) => {
  if (check(state, "{")) {
    const fields = commaList(state, checkStructFieldType);
    match(state, "}");
    return fields;
  } else if (check(state, "(")) {
    const fields = commaList(state, checkType);
    match(state, ")");
    return fields.map((type, i) => ({ fieldName: String(i), type }));
  } else {
    return [];
  }
};

const checkStructFieldType: Parser<StructFieldType | null> = (state) => {
  const fieldName = checkField(state);
  if (!fieldName) return null;
  match(state, ":");
  const type = matchType(state);
  return { fieldName, type };
};

const matchStructFieldValueList: Parser<StructFieldValue[]> = (state) => {
  if (check(state, "{")) {
    const fields = commaList(state, checkStructFieldValue);
    match(state, "}");
    return fields;
  } else if (check(state, "(")) {
    const fields = commaList(state, checkExpr);
    match(state, ")");
    return fields.map((expr, i) => ({ fieldName: String(i), expr }));
  } else {
    return [];
  }
};

const checkField: Parser<string | null> = (state) => {
  const field = check(state, "identifier");
  if (field) return field.value;
  const field2 = check(state, "integer");
  if (field2) return String(field2.value);
  return null;
};

const checkStructFieldValue: Parser<StructFieldValue | null> = (state) => {
  const fieldName = checkField(state);
  if (!fieldName) return null;
  if (check(state, ":")) {
    const expr = matchExpr(state);
    return { fieldName, expr };
  } else {
    return { fieldName, expr: { tag: "identifier", value: fieldName } };
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

function check<Tag extends Token["tag"]>(
  state: IParseState,
  tag: Tag
): (Token & { tag: Tag }) | null {
  const token = state.token();
  if (token.tag === tag) {
    state.advance();
    return token as Token & { tag: Tag };
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
