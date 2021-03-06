import {
  Stmt,
  Expr,
  Binding,
  IfCase,
  TypeExpr,
  TypeBinding,
  EnumType,
  StructFieldType,
  StructFieldValue,
  MatchCase,
  StructFieldBinding,
  TypeParam,
  TraitField,
  TraitExpr,
  EnumBinding,
} from "./ast";
import { Token } from "./token";

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

export class ParseError extends Error {
  constructor(expected: string, received: Token) {
    super(`expected ${expected}, received ${received.tag}`);
  }
}

export function parse(input: Token[]): Stmt[] {
  return matchProgram(new ParseState(input));
}

const matchProgram: Parser<Stmt[]> = (state) => {
  return parseUntil(state, matchStatement, checkEndOfInput);
};

const matchStatement: Parser<Stmt | null> = (state) => {
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
      if (check(state, "{")) {
        const fields = commaList(state, checkStructFieldType);
        match(state, "}");
        return { tag: "struct", binding, fields };
      } else {
        match(state, "(");
        const fields = commaList(state, checkType);
        match(state, ")");
        return { tag: "structTuple", binding, fields };
      }
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
      const block = matchBlock(state);
      return { tag: "while", expr, block };
    }
    case "for": {
      state.advance();
      match(state, "(");
      const binding = matchBinding(state);
      match(state, "in");
      const expr = matchExpr(state);
      match(state, ")");
      const block = matchBlock(state);
      return { tag: "for", binding, expr, block };
    }
    case "return": {
      state.advance();
      const expr = checkExpr(state);
      return { tag: "return", expr };
    }
    case "func": {
      state.advance();
      const name = match(state, "identifier").value;
      const typeParameters = matchTypeParams(state);

      match(state, "(");
      const parameters = commaList(state, checkFuncParam);
      match(state, ")");
      match(state, ":");
      const returnType = matchType(state);
      const block = matchBlock(state);
      return {
        tag: "func",
        name,
        parameters,
        returnType,
        typeParameters,
        block,
      };
    }
    case "trait": {
      state.advance();
      const binding = matchTypeBinding(state);
      const fields = matchTraitFields(state);
      return { tag: "trait", binding, fields };
    }
    case "impl": {
      state.advance();
      const typeParameters = matchTypeParams(state);
      const trait = matchType(state);
      match(state, "for");
      const target = matchType(state);
      const block = matchBlock(state);
      return { tag: "impl", typeParameters, trait, target, block };
    }
    case ";":
      state.advance();
      return null;
    default: {
      const expr = matchExpr(state);
      if (check(state, "=")) {
        if (expr.tag !== "index") {
          throw new Error("invalid assignment");
        }
        const { expr: target, index } = expr;
        const value = matchExpr(state);
        return { tag: "assign", target, index, value };
      } else {
        return { tag: "expr", expr };
      }
    }
  }
};

const matchExpr: Parser<Expr> = (state) => {
  return assert(state, "expression", checkExpr(state));
};

const checkExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, checkAddExpr, ["==", "!=", ">", "<", "<=", ">="]);
};

// TODO: stick logic in here

const checkAddExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, checkMulExpr, ["+", "-"]);
};

const checkMulExpr: Parser<Expr | null> = (state) => {
  return infixLeft(state, checkPrefixExpr, ["*", "/", "%"]);
};

const checkPrefixExpr: Parser<Expr | null> = (state) => {
  const tok = state.token();
  if (tok.tag === "!" || tok.tag === "-") {
    state.advance();
    const expr = assert(state, "expression", checkPrefixExpr(state));
    return { tag: "unaryOp", operator: tok.tag, expr };
  } else {
    return checkPostfixExpr(state);
  }
};

const checkPostfixExpr: Parser<Expr | null> = (state) => {
  let expr = checkBaseExpr(state);
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
        const fieldName = checkField(state);
        if (fieldName) {
          expr = { tag: "field", expr, fieldName };
        } else {
          const index = assert(state, "field", checkIndex(state));
          expr = { tag: "index", expr, index };
        }
        break;
      }
      case ".": {
        state.advance();
        const ident = match(state, "identifier");
        const target: Expr = { tag: "identifier", value: ident.value };
        if (check(state, "(")) {
          const args = commaList(state, checkExpr);
          match(state, ")");
          expr = { tag: "call", expr: target, args: [expr, ...args] };
        } else {
          expr = { tag: "call", expr: target, args: [expr] };
        }
        break;
      }
      default:
        return expr;
    }
  }
};

const checkBaseExpr: Parser<Expr | null> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "(": {
      state.advance();
      if (check(state, ")")) {
        return { tag: "tuple", items: [] };
      }
      const expr = matchExpr(state);
      if (check(state, ",")) {
        const rest = commaList(state, checkExpr);
        match(state, ")");
        return { tag: "tuple", items: [expr, ...rest] };
      } else {
        match(state, ")");
        return expr;
      }
    }
    case "[": {
      state.advance();
      const items = commaList(state, checkExpr);
      match(state, "]");
      return { tag: "list", items };
    }
    case "typeIdentifier":
      state.advance();
      return matchTypeStructure(state, token.value);
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
    case "||": {
      // in this context, `||` begins a closure with no args, not logical or
      state.advance();
      const block = matchBlockOrExpr(state);
      return { tag: "closure", parameters: [], block };
    }
    case "|": {
      state.advance();
      const parameters = commaList(state, checkBinding);
      match(state, "|");
      const block = matchBlockOrExpr(state);
      return { tag: "closure", parameters, block };
    }
    case "do":
      state.advance();
      return { tag: "do", block: matchBlock(state) };
    case "if": {
      state.advance();
      const cases: IfCase[] = [];
      while (true) {
        match(state, "(");
        const predicate = matchExpr(state);
        match(state, ")");
        const block = matchBlock(state);
        cases.push({ tag: "cond", predicate, block });
        if (check(state, "else")) {
          if (check(state, "if")) continue;
          const elseBlock = matchBlock(state);
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
  let binding: EnumBinding = {
    tag: "tuple",
    tagName: enumTag.value,
    fields: [],
  };
  if (check(state, "{")) {
    const fields = commaList(state, checkStructFieldBinding);
    match(state, "}");
    binding = { tag: "record", tagName: enumTag.value, fields };
  } else if (check(state, "(")) {
    const fields = commaList(state, checkBinding);
    match(state, ")");
    binding = { tag: "tuple", tagName: enumTag.value, fields };
  }

  match(state, "=>");
  const block = matchBlockOrExpr(state);
  return { binding, block };
};

const matchBlockOrExpr: Parser<Stmt[]> = (state) => {
  if (state.token().tag === "{") {
    const block = matchBlock(state);
    return block;
  } else {
    const expr = matchExpr(state);
    return [{ tag: "expr", expr }];
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
    case "{": {
      state.advance();
      const fields = commaList(state, checkStructFieldBinding);
      match(state, "}");
      return { tag: "record", fields };
    }
    case "(": {
      state.advance();
      const fields = commaList(state, checkBinding);
      match(state, ")");
      return { tag: "tuple", fields };
    }
    default:
      return null;
  }
};

const matchTypeBinding: Parser<TypeBinding> = (state) => {
  const { value } = match(state, "typeIdentifier");
  const typeParameters = matchTypeParams(state);
  return { tag: "identifier", value, typeParameters };
};

const matchType: Parser<TypeExpr> = (state) => {
  return assert(state, "type", checkType(state));
};

const matchTrait: Parser<TraitExpr> = (state) => {
  const token = match(state, "typeIdentifier");
  const typeArgs = matchTypeArgs(state);
  return { tag: "identifier", value: token.value, typeArgs };
};

const checkType: Parser<TypeExpr | null> = (state) => {
  const token = state.token();
  switch (token.tag) {
    case "typeIdentifier": {
      state.advance();
      if (check(state, "[")) {
        const type = matchType(state);
        match(state, ";");
        const size = match(state, "integer").value;
        match(state, "]");
        return { tag: "array", value: token.value, type, size };
      } else {
        const typeArgs = matchTypeArgs(state);
        return { tag: "identifier", value: token.value, typeArgs };
      }
    }
    case "(": {
      state.advance();
      const typeArgs = commaList(state, checkType);
      match(state, ")");
      return { tag: "tuple", typeArgs };
    }
    case "func": {
      state.advance();
      const typeParameters = matchTypeParams(state);
      match(state, "(");
      const parameters = commaList(state, checkType);
      match(state, ")");
      match(state, ":");
      const returnType = matchType(state);
      return { tag: "func", typeParameters, parameters, returnType };
    }
    default:
      return null;
  }
};

const matchTraitFields: Parser<TraitField[]> = (state) => {
  match(state, "{");
  return parseUntil(state, matchTraitField, checkEndBrace);
};

const matchTraitField: Parser<TraitField> = (state) => {
  match(state, "func");
  const name = match(state, "identifier").value;
  const typeParameters = matchTypeParams(state);
  match(state, "(");
  const parameters = commaList(state, checkType);
  match(state, ")");
  match(state, ":");
  const returnType = matchType(state);
  return { tag: "func", name, typeParameters, parameters, returnType };
};

const matchTypeArgs: Parser<TypeExpr[]> = (state) => {
  if (!check(state, "<")) return [];
  const typeArgs = commaList(state, checkType);
  match(state, ">");
  return typeArgs;
};

const matchTypeParams: Parser<TypeParam[]> = (state) => {
  if (!check(state, "<")) return [];
  const typeParameters = commaList(state, checkTypeParam);
  match(state, ">");
  return typeParameters;
};

const checkTypeParam: Parser<TypeParam | null> = (state) => {
  const param = check(state, "typeIdentifier");
  if (!param) return null;
  const traits: TraitExpr[] = [];
  if (check(state, ":")) {
    while (true) {
      traits.push(matchTrait(state));
      if (!check(state, "+")) break;
    }
  }
  return { tag: "identifier", value: param.value, traits };
};

const checkEnumCase: Parser<EnumType | null> = (state) => {
  const tagName = check(state, "typeIdentifier");
  if (!tagName) return null;
  if (check(state, "{")) {
    const fields = commaList(state, checkStructFieldType);
    match(state, "}");
    return { tag: "record", tagName: tagName.value, fields };
  } else if (check(state, "(")) {
    const fields = commaList(state, checkType);
    match(state, ")");
    return { tag: "tuple", tagName: tagName.value, fields };
  } else {
    return { tag: "tuple", tagName: tagName.value, fields: [] };
  }
};

const checkStructFieldType: Parser<StructFieldType | null> = (state) => {
  const fieldName = checkField(state);
  if (!fieldName) return null;
  match(state, ":");
  const type = matchType(state);
  return { fieldName, type };
};

function matchTypeStructure(state: IParseState, value: string): Expr {
  const tok = state.token();
  switch (tok.tag) {
    case "{": {
      state.advance();
      const fields = commaList(state, checkStructFieldValue);
      match(state, "}");
      return { tag: "typeRecord", value, fields };
    }
    case "(": {
      state.advance();
      const items = commaList(state, checkExpr);
      match(state, ")");
      return { tag: "typeTuple", value, items };
    }
    case "[": {
      state.advance();
      const items = commaList(state, checkExpr);
      if (items.length === 1 && check(state, ";")) {
        const size = match(state, "integer").value;
        match(state, "]");
        return { tag: "typeSizedList", value, expr: items[0], size };
      } else {
        match(state, "]");
        return { tag: "typeList", value, items };
      }
    }
    default:
      return { tag: "typeLiteral", value };
  }
}

const checkField: Parser<string | null> = (state) => {
  const field = check(state, "identifier");
  if (field) return field.value;
  return null;
};

const checkIndex: Parser<number | null> = (state) => {
  const field = check(state, "integer");
  if (field) return field.value;
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

const checkEndOfInput: Parser<boolean> = (state) => {
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
const matchBlock: Parser<Stmt[]> = (state) => {
  match(state, "{");
  return parseUntil(state, matchStatement, checkEndBrace);
};

function parseUntil<T>(
  state: IParseState,
  parseValue: Parser<T | null>,
  parseEnd: Parser<boolean>
): T[] {
  const out: T[] = [];
  while (!parseEnd(state)) {
    const value = parseValue(state);
    if (value) {
      out.push(value);
    }
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
  if (res === null) {
    throw new ParseError(type, state.token());
  }
  return res;
}
