import { Token } from "moo";
import { keywords } from "./lexer";

class ParseError extends Error {}
class NoMatch extends ParseError {}

type Stmt =
  | { tag: "pub"; stmt: Stmt }
  | { tag: "type"; binding: TypeBinding; value: TypeExpr }
  | { tag: "enum"; binding: TypeBinding; cases: EnumCase[] }
  | { tag: "struct"; binding: TypeBinding; value: TypeStruct }
  | {
      tag: "impl";
      params: TypeParam[];
      trait: TypeExpr;
      forType: TypeExpr;
      body: TypeStruct;
    }
  | { tag: "module"; name: string; body: Stmt[] }
  | { tag: "import"; path: ImportPath; package: string | null }
  | { tag: "let"; binding: Binding; type: TypeExpr | null; expr: Expr }
  | {
      tag: "func";
      identifier: string;
      typeParams: TypeParam[];
      params: FuncParam[];
      returnType: TypeExpr;
      body: Stmt[];
    }
  | { tag: "for"; binding: Binding; expr: Expr; body: Stmt[] }
  | { tag: "while"; clause: IfClause; body: Stmt[] }
  | { tag: "break" }
  | { tag: "continue" }
  | { tag: "return"; expr: Expr }
  | { tag: "expr"; value: Expr }
  | { tag: "semi" };

type TypeBinding = { tag: "identifier"; value: string; params: TypeParam[] };

type TypeParam = { tag: "identifier"; value: string; traits: TypeExpr[] };

type EnumCase = { enumTag: string; value: TypeStruct };

type TypeStruct =
  | { tag: "tuple"; args: TypeExpr[] }
  | { tag: "record"; fields: Array<{ key: string; value: TypeExpr }> };

type TypeExpr =
  | { tag: "identifier"; path: string[]; args: TypeExpr[] }
  | {
      tag: "func";
      typeParams: TypeParam[];
      params: FuncParam[];
      returns: TypeExpr;
    };
type FuncParam = { binding: Binding; type: TypeExpr };

type ImportPath = never;

type Expr =
  | { tag: "number"; value: number }
  | { tag: "string"; value: string }
  | { tag: "closure"; params: Binding[]; body: Stmt[] }
  | { tag: "list"; value: Expr[] }
  | { tag: "record"; value: Field[] }
  | { tag: "do"; body: Stmt[] }
  | { tag: "if"; clauses: IfClause[]; elseClause: Stmt[] }
  | { tag: "match"; expr: Expr; cases: MatchCase[] }
  | { tag: "identifier"; path: string[] }
  | { tag: "typeConstructor"; path: string[] }
  | { tag: "call"; callee: Expr; args: Expr[] }
  | { tag: "fieldAccess"; target: Expr; field: Field }
  | { tag: "asType"; expr: Expr; type: TypeExpr }
  | { tag: "unaryOpExpr"; expr: Expr; operator: string }
  | { tag: "binaryOpExpr"; left: Expr; right: Expr; operator: string };

type Field =
  | { tag: "identifier"; value: string }
  | { tag: "number"; value: number };

type IfClause =
  | { tag: "cond"; predicate: Expr; body: Stmt[] }
  | { tag: "binding"; binding: Binding; expr: Expr; body: Stmt[] };

type MatchCase = { binding: Binding; expr: Expr };

type Binding = { tag: "identifier"; value: string };

export function parse(tokens: Token[]) {
  const state = new ParseState(tokens);
  return program(state);
}

interface IParseState {
  token(): Token;
  advance(): void;
}

type Parser<T> = (state: IParseState) => T;

class ParseState implements IParseState {
  private index = 0;
  private endOfInput: Token;
  constructor(private tokens: Token[]) {
    const lastToken = tokens[tokens.length - 1];
    this.endOfInput = {
      type: "endOfInput",
      value: "",
      text: "",
      toString: () => "",
      lineBreaks: 0,
      offset: lastToken.offset + lastToken.text.length,
      line: lastToken.line,
      col: lastToken.col + lastToken.text.length,
    };
  }
  token(): Token {
    return this.tokens[this.index] ?? this.endOfInput;
  }
  advance(): void {
    this.index++;
  }
}

function program(state: IParseState): Stmt[] {
  const statements: Stmt[] = [];
  while (!check(state, "endOfInput")) {
    statements.push(stmt(state));
  }
  return statements;
}

// statements

function stmt(state: IParseState): Stmt {
  if (check(state, "pub")) {
    return { tag: "pub", stmt: baseStmt(state) };
  }
  return baseStmt(state);
}

function baseStmt(state: IParseState): Stmt {
  const token = state.token();
  switch (token.type) {
    case "import":
      throw new Error("not yet implemented");
    case "module": {
      state.advance();
      const name = match(state, "typeIdentifier").value;
      const body = block(state);
      return { tag: "module", name, body };
    }
    case "type": {
      state.advance();
      const binding = typeBinding(state);
      match(state, "=");
      const value = typeExpr(state);
      return { tag: "type", binding, value };
    }
    case "enum": {
      state.advance();
      const binding = typeBinding(state);
      const cases: EnumCase[] = [];
      match(state, "{");
      while (!check(state, "}")) {
        cases.push(enumCase(state));
      }
      return { tag: "enum", binding, cases };
    }
    case "struct": {
      state.advance();
      const binding = typeBinding(state);
      const value = typeBody(state);
      return { tag: "struct", binding, value };
    }
    case "impl": {
      state.advance();
      const params = optTypeParams(state);
      const trait = typeExpr(state);
      match(state, "for");
      const forType = typeExpr(state);
      const body = typeBody(state);
      return { tag: "impl", params, trait, forType, body };
    }
    case "let": {
      state.advance();
      const bind = binding(state);
      let type = null;
      if (check(state, ":")) {
        type = typeExpr(state);
      }

      match(state, "=");
      const exp = expr(state);
      return { tag: "let", binding: bind, type, expr: exp };
    }
    case "func": {
      state.advance();
      const identifier = match(state, "identifier").value;
      const typeParams = optTypeParams(state);
      const params = funcParams(state);
      match(state, ":");
      const returnType = typeExpr(state);
      const body = block(state);
      return { tag: "func", identifier, typeParams, params, returnType, body };
    }
    case "for": {
      state.advance();
      const bind = binding(state);
      match(state, "in");
      const exp = expr(state);
      const body = block(state);
      return { tag: "for", binding: bind, expr: exp, body };
    }
    case "while": {
      state.advance();
      const clause = ifCond(state);
      const body = block(state);
      return { tag: "while", clause, body };
    }
    case "return":
      state.advance();
      return { tag: "return", expr: expr(state) };
    case "break":
      state.advance();
      return { tag: "break" };
    case "continue":
      state.advance();
      return { tag: "continue" };
    default:
      return { tag: "expr", value: expr(state) };
  }
}

// types
function typeBinding(state: IParseState): TypeBinding {
  const value = match(state, "typeIdentifier").value;
  const params = optTypeParams(state);
  return { tag: "identifier", value, params };
}

function typeExpr(state: IParseState): TypeExpr {
  if (check(state, "func")) {
    const typeParams = optTypeParams(state);
    const params = funcParams(state);
    match(state, ":");
    const returns = typeExpr(state);
    return { tag: "func", typeParams, params, returns };
  }

  const path = [match(state, "typeIdentifier").value];
  while (check(state, "::")) {
    path.push(match(state, "typeIdentifier").value);
  }
  if (check(state, "[")) {
    const args = commasUntil(state, typeExpr, "]");
    return { tag: "identifier", path, args };
  } else {
    return { tag: "identifier", path, args: [] };
  }
}

function optTypeParams(state: IParseState) {
  if (check(state, "[")) {
    return commasUntil(state, typeParam, "]");
  }
  return [];
}

function typeParam(state: IParseState): TypeParam {
  const value = match(state, "typeIdentifier").value;
  if (check(state, ":")) {
    const traits = [typeExpr(state)];
    while (check(state, "+")) {
      traits.push(typeExpr(state));
    }
    return { tag: "identifier", value, traits };
  }
  return { tag: "identifier", value, traits: [] };
}

function funcParams(state: IParseState): FuncParam[] {
  match(state, "(");
  return commasUntil(state, funcParam, ")");
}
function funcParam(state: IParseState): FuncParam {
  const bind = binding(state);
  match(state, ":");
  const type = typeExpr(state);
  return { binding: bind, type };
}

function enumCase(state: IParseState): EnumCase {
  match(state, "case");
  const enumTag = match(state, "typeIdentifier").value;
  const value = typeBody(state);
  return { enumTag, value };
}

function typeBody(state: IParseState): TypeStruct {
  switch (state.token().type) {
    case "{":
      state.advance();
      const fields = commasUntil(state, structField, "}");
      return { tag: "record", fields };
    case "(":
      const args = commasUntil(state, typeExpr, ")");
      return { tag: "tuple", args };
    default:
      throw new NoMatch();
  }
}

function structField(state: IParseState): { key: string; value: TypeExpr } {
  const token = state.token();
  if (token.type === "identifier" || keywords.has(token.type!)) {
    state.advance();
    match(state, ":");

    const value = typeExpr(state);
    return { key: token.value, value };
  } else {
    throw new NoMatch();
  }
}

// expressions

function expr(state: IParseState): Expr {
  return assignExpr(state);
}

function assignExpr(state: IParseState): Expr {
  return infixRight(state, orExpr, ["="]);
}

function orExpr(state: IParseState): Expr {
  return infixLeft(state, andExpr, ["||"]);
}

function andExpr(state: IParseState): Expr {
  return infixLeft(state, compExpr, ["&&"]);
}

function compExpr(state: IParseState): Expr {
  return infixLeft(state, addSubExpr, ["==", "!=", "<", ">", "<=", ">="]);
}

function addSubExpr(state: IParseState): Expr {
  return infixLeft(state, mulDivExpr, ["+", "-"]);
}

function mulDivExpr(state: IParseState): Expr {
  return infixLeft(state, powExpr, ["*", "/"]);
}

function powExpr(state: IParseState): Expr {
  return infixRight(state, prefixExpr, ["**"]);
}

function prefixExpr(state: IParseState): Expr {
  const op = state.token().type;
  if (op === "!" || op === "-") {
    state.advance();
    const next = prefixExpr(state);
    return { tag: "unaryOpExpr", operator: op, expr: next };
  }
  return postfixExpr(state);
}

function postfixExpr(state: IParseState): Expr {
  const value = baseExpr(state);
  const peek = state.token();
  switch (peek.type) {
    case "(": {
      state.advance();
      const args = commasUntil(state, expr, ")");
      return { tag: "call", callee: value, args };
    }
    case ".": {
      state.advance();
      const callee = identifierExpr(state);
      match(state, "(");
      const args = commasUntil(state, expr, ")");
      return { tag: "call", callee, args: [value, ...args] };
    }
    case ":": {
      state.advance();
      const fieldValue = field(state);
      return { tag: "fieldAccess", target: value, field: fieldValue };
    }
    case "as": {
      state.advance();
      const type = typeExpr(state);
      return { tag: "asType", expr: value, type };
    }
    default:
      return value;
  }
}

function baseExpr(state: IParseState): Expr {
  const next = state.token();
  switch (next.type) {
    case "number":
      state.advance();
      return { tag: "number", value: Number(next.value) };
    case "string":
      state.advance();
      return { tag: "string", value: next.value.slice(1, -1) };
    case "(": {
      state.advance();
      const val = expr(state);
      match(state, ")");
      return val;
    }
    case "|": {
      state.advance();
      const params = commasUntil(state, binding, "|");
      const body = block(state);
      return { tag: "closure", params, body };
    }
    case "#[": {
      state.advance();
      const value = commasUntil(state, expr, "]");
      return { tag: "list", value };
    }
    case "{": {
      state.advance();
      const value = commasUntil(state, field, "}");
      return { tag: "record", value };
    }
    case "do": {
      state.advance();
      const body = block(state);
      return { tag: "do", body };
    }
    case "identifier":
    case "typeIdentifier":
      return identifierExpr(state);
    case "if":
      return ifExpr(state);
    case "match":
      return matchExpr(state);
    default:
      throw new NoMatch();
  }
}

function identifierExpr(state: IParseState): Expr {
  const path: string[] = [];
  while (true) {
    const ident = check(state, "identifier");
    if (ident) {
      path.push(ident.value);
      return { tag: "identifier", path };
    }
    path.push(match(state, "typeIdentifier").value);
    if (!check(state, "::")) {
      return { tag: "typeConstructor", path };
    }
  }
}

function field(state: IParseState): Field {
  const token = state.token();
  if (token.type === "identifier" || keywords.has(token.type!)) {
    state.advance();
    return { tag: "identifier", value: token.value };
  } else if (token.type === "number") {
    state.advance();
    return { tag: "number", value: Number(token.value) };
  }
  throw new NoMatch();
}

function ifExpr(state: IParseState): Expr {
  const clauses = [ifCond(state)];
  while (check(state, "else")) {
    if (check(state, "if")) {
      clauses.push(ifCond(state));
    } else {
      const elseClause = block(state);
      return { tag: "if", clauses, elseClause };
    }
  }
  return { tag: "if", clauses, elseClause: [] };
}

function ifCond(state: IParseState): IfClause {
  match(state, "if");
  if (check(state, "let")) {
    const bind = binding(state);
    match(state, "in");
    const value = expr(state);
    const body = block(state);
    return { tag: "binding", binding: bind, expr: value, body };
  } else {
    const predicate = expr(state);
    const body = block(state);
    return { tag: "cond", predicate, body };
  }
}

function matchExpr(state: IParseState): Expr {
  const cases: MatchCase[] = [];
  match(state, "match");
  const value = expr(state);
  match(state, "{");
  while (!check(state, "}")) {
    match(state, "case");
    const value = binding(state);
    match(state, "=>");
    const exp = expr(state);
    cases.push({ binding: value, expr: exp });
  }
  return { tag: "match", expr: value, cases };
}

// bindings

function binding(state: IParseState): Binding {
  const next = match(state, "identifier");
  return { tag: "identifier", value: next.value };
}

// helpers

function match(state: IParseState, type: string): Token {
  const token = state.token();
  if (token.type !== type) throw new NoMatch();
  state.advance();
  return token;
}

function check(state: IParseState, type: string): Token | null {
  const token = state.token();
  if (token.type !== type) return null;
  state.advance();
  return token;
}

function block(state: IParseState): Stmt[] {
  const statements: Stmt[] = [];
  match(state, "{");
  while (!check(state, "}")) {
    statements.push(stmt(state));
  }
  return statements;
}

function commasUntil<T>(
  state: IParseState,
  valueParser: Parser<T>,
  closingOperator: string
): T[] {
  const values: T[] = [];
  while (true) {
    if (check(state, closingOperator)) break;
    values.push(valueParser(state));
    if (check(state, closingOperator)) break;
    match(state, ",");
  }
  return values;
}

function infixLeft(
  state: IParseState,
  nextParser: Parser<Expr>,
  operators: string[]
): Expr {
  let left = nextParser(state);
  while (true) {
    const operator = state.token().value;
    if (!operators.includes(operator)) {
      break;
    }
    state.advance();
    const right = nextParser(state);
    left = { tag: "binaryOpExpr", left, right, operator };
  }
  return left;
}

function infixRight(
  state: IParseState,
  nextParser: Parser<Expr>,
  operators: string[]
): Expr {
  let left = nextParser(state);
  const operator = state.token().value;
  if (!operators.includes(operator)) return left;
  state.advance();
  const right = infixRight(state, nextParser, operators);
  return { tag: "binaryOpExpr", left, right, operator };
}
