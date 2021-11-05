type Token = { type: string; value: any };
const endOfInput: Token = { type: "end_of_input", value: null };

type FirstSet = Set<Token["type"]>;

interface IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  parse(state: IParseState): ParseResult<T>;
}

interface IParseState {
  token(): Token;
  advance(): IParseState;
}

class ParseState implements IParseState {
  constructor(private input: Token[], private index = 0) {}
  token() {
    return this.input[this.index] || endOfInput;
  }
  advance() {
    return new ParseState(this.input, this.index + 1);
  }
}

type ParseError =
  | { tag: "matchError"; parser: IParser<unknown>; token: Token }
  | { tag: "error"; description: string };

type ParseResult<Value> =
  | { tag: "ok"; value: Value; state: IParseState }
  | { tag: "error"; error: ParseError; state: IParseState };

class Succeed<T> implements IParser<T> {
  firstSet: FirstSet = new Set();
  matchEmpty = true;
  constructor(private value: T) {}
  parse(state: IParseState): ParseResult<T> {
    return { tag: "ok", value: this.value, state };
  }
}

class Fail implements IParser<never> {
  firstSet: FirstSet = new Set();
  matchEmpty = true;
  constructor(private description: string) {}
  parse(state: IParseState): ParseResult<never> {
    return {
      tag: "error",
      state,
      error: { tag: "error", description: this.description },
    };
  }
}

const ok = new Succeed(null);

class Match implements IParser<any> {
  firstSet: FirstSet;
  matchEmpty = false;
  constructor(private token: Token["type"]) {
    this.firstSet = new Set([token]);
  }
  parse(state: IParseState): ParseResult<any> {
    const tok = state.token();
    if (tok.type === this.token) {
      return { tag: "ok", value: tok.value, state: state.advance() };
    } else {
      return {
        tag: "error",
        state,
        error: { tag: "matchError", parser: this, token: tok },
      };
    }
  }
}

class Seq<Left, Right, Out> implements IParser<Out> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(
    private left: IParser<Left>,
    private right: IParser<Right>,
    private join: (l: Left, b: Right) => Out
  ) {
    this.firstSet = new Set(left.firstSet);
    if (!left.matchEmpty) {
      this.matchEmpty = false;
      return;
    }
    for (const token of right.firstSet) {
      if (this.firstSet.has(token)) {
        throw new Error("first/follow conflict");
      }
      this.firstSet.add(token);
    }
    this.matchEmpty = right.matchEmpty;
  }
  parse(state: IParseState): ParseResult<Out> {
    const left = this.left.parse(state);
    if (left.tag !== "ok") return left;
    const right = this.right.parse(left.state);
    if (right.tag !== "ok") return right;
    return {
      tag: "ok",
      value: this.join(left.value, right.value),
      state: right.state,
    };
  }
}

class Alt2<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(private left: IParser<T>, private right: IParser<T>) {
    if (left.matchEmpty && right.matchEmpty) {
      throw new Error("first/first conflict");
    }
    this.matchEmpty = left.matchEmpty || right.matchEmpty;

    this.firstSet = new Set(left.firstSet);
    for (const token of right.firstSet) {
      if (this.firstSet.has(token)) {
        throw new Error("first/first conflict");
      }
      this.firstSet.add(token);
    }
  }
  parse(state: IParseState): ParseResult<T> {
    const next = state.token();
    if (this.left.firstSet.has(next.type) || this.left.matchEmpty) {
      return this.left.parse(state);
    }
    return this.right.parse(state);
  }
}

class Alt<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  private table = new Map<Token["type"], IParser<T>>();
  private parseEmpty: IParser<T> | null = null;
  constructor(parsers: IParser<T>[]) {
    if (parsers.length === 0) {
      throw new Error("parser will always fail");
    }
    this.firstSet = new Set();
    this.matchEmpty = false;
    for (const parser of parsers) {
      for (const token of parser.firstSet) {
        if (this.table.has(token)) {
          throw new Error("first/first conflict");
        }
        this.table.set(token, parser);
        this.firstSet.add(token);
      }
      if (parser.matchEmpty) {
        if (this.parseEmpty) {
          throw new Error("first/first conflict");
        }
        this.matchEmpty = true;
        this.parseEmpty = parser;
      }
    }
  }
  parse(state: IParseState): ParseResult<T> {
    const next = state.token();
    const parser = this.table.get(next.type);
    if (parser) return parser.parse(state);
    if (this.parseEmpty) return this.parseEmpty.parse(state);
    return {
      tag: "error",
      state,
      error: { tag: "matchError", parser: this, token: next },
    };
  }
}

class Repeat<T> implements IParser<T[]> {
  firstSet: FirstSet;
  matchEmpty = true;
  constructor(private parser: IParser<T>) {
    this.firstSet = new Set(this.parser.firstSet);
    if (this.parser.matchEmpty) {
      throw new Error("first/follow conflict");
    }
  }
  parse(state: IParseState): ParseResult<T[]> {
    const results: T[] = [];
    while (true) {
      const next = state.token();
      if (!this.firstSet.has(next.type)) break;
      const result = this.parser.parse(state);
      if (result.tag === "error") return result;
      state = result.state;
      results.push(result.value);
    }
    return { tag: "ok", value: results, state };
  }
}

class Lazy<T> implements IParser<T> {
  private parser: IParser<T> | null = null;
  constructor(private getParser: () => IParser<T>) {}
  get firstSet(): FirstSet {
    if (this.parser) return this.parser.firstSet;
    throw new Error("Left recursion");
  }
  get matchEmpty(): boolean {
    if (this.parser) return this.parser.matchEmpty;
    throw new Error("Left recursion");
  }
  parse(state: IParseState): ParseResult<T> {
    if (!this.parser) this.parser = this.getParser();
    return this.parser.parse(state);
  }
}

class Excluding<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(private parser: IParser<T>, excludeTokens: Token[]) {
    this.firstSet = new Set(parser.firstSet);
    this.matchEmpty = parser.matchEmpty;
    for (const token of excludeTokens) {
      this.firstSet.delete(token.type);
    }
  }
  parse(state: IParseState): ParseResult<T> {
    const next = state.token();
    if (this.firstSet.has(next.type)) {
      return this.parser.parse(state);
    }
    return {
      tag: "error",
      state,
      error: { tag: "matchError", token: next, parser: this },
    };
  }
}

class NonEmpty<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty = false;
  constructor(private parser: IParser<T>) {
    this.firstSet = new Set(parser.firstSet);
  }
  parse(state: IParseState): ParseResult<T> {
    const before = state.token();
    const result = this.parser.parse(state);
    const after = state.token();
    if (before === after)
      return {
        tag: "error",
        state,
        error: { tag: "matchError", parser: this, token: after },
      };
    return result;
  }
}

class Try<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(private first: IParser<T>, private second: IParser<T>) {
    this.firstSet = new Set([...this.first.firstSet, ...this.second.firstSet]);
    this.matchEmpty = first.matchEmpty || second.matchEmpty;
  }
  parse(state: IParseState): ParseResult<T> {
    const result = this.first.parse(state);
    if (result.tag === "ok") return result;
    return this.second.parse(state);
  }
}

class MapParser<T, U> implements IParser<U> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(private parser: IParser<T>, private fn: (from: T) => U) {
    this.firstSet = new Set(parser.firstSet);
    this.matchEmpty = parser.matchEmpty;
  }
  parse(state: IParseState): ParseResult<U> {
    const result = this.parser.parse(state);
    if (result.tag !== "ok") return result;
    return { tag: "ok", value: this.fn(result.value), state: result.state };
  }
}

class Wrap<T> implements IParser<T> {
  firstSet: FirstSet;
  matchEmpty: boolean;
  constructor(private parser: IParser<T>) {
    this.firstSet = new Set(parser.firstSet);
    this.matchEmpty = parser.matchEmpty;
  }
  parse(state: IParseState): ParseResult<T> {
    return this.parser.parse(state);
  }
  map<U>(fn: (t: T) => U): Wrap<U> {
    return new Wrap(new MapParser(this.parser, fn));
  }
  andThen<U>(parser: IParser<U>): Wrap<U> {
    return new Wrap(new Seq(this.parser, parser, (_, right) => right));
  }
  followedBy(parser: IParser<unknown>): Wrap<T> {
    return new Wrap(new Seq(this.parser, parser, (left, _) => left));
  }
  or(parser: IParser<T>): Wrap<T> {
    return new Wrap(new Alt2(this.parser, parser));
  }
  catch(parser: IParser<T>): Wrap<T> {
    return new Wrap(new Try(this.parser, parser));
  }
  repeat(): Wrap<T[]> {
    return new Wrap(new Repeat(this.parser));
  }
  repeat1(): Wrap<T[]> {
    return new Wrap(
      new Seq(this.parser, new Repeat(this.parser), (h, t) => [h].concat(t))
    );
  }
  optional(): Wrap<T | null> {
    return new Wrap(new Alt2(this.parser, ok));
  }
  sepBy1(separator: IParser<unknown>): Wrap<T[]> {
    return new Wrap(
      new Seq(
        this.parser,
        new Repeat(new Seq(separator, this.parser, (_, r) => r)),
        (h, t) => [h].concat(t)
      )
    );
  }
  sepBy(separator: IParser<unknown>): Wrap<T[]> {
    return this.sepBy1(separator)
      .optional()
      .map((res) => (res === null ? [] : res));
  }
  sepByTrailing(separator: IParser<unknown>): Wrap<T[]> {
    return this.sepBy(separator).followedBy(new Wrap(separator).optional());
  }
}
