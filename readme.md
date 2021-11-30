# Turkey

An exercise in programming language implementation

## Overview

Turkey is a programming language with no particularly interesting features, intended to be a jumping off point for future language design. It features static types, curly-brace syntax, and limited-but-otherwise-unrestricted mutability.

### Syntax

Curly brace, largely modeled after Rust but should feel familiar to most programmers. All whitespace is ignored (simliar to Lua), and semicolons are used only for disambiguation.

```
let a = 1
let b = ["hello", "from", "turkey"]
let c = Point { x: 1.5, y: -2.5 }
let d = if (a > 1) {
  Some(c:x)
} else {
  None
}
let e = d.then(|f| f * 2.0)
let g: Float = match (e) {
  Some(h) => h + 1.5,
  None => 0.0
}
```

### Types

Static types, local bidirectional type inference, sum types + pattern matching, generics, traits. No subtyping, higher-kinded types, classes, first class modules, borrow checker.

## Implementation

the compilation process follows this pipeline:

```
        ---------          ----------       ---------------      ------------            ---------------
------> | lexer | -------> | parser | ----> | typechecker | ---> | compiler | ---------> | interpreter |
source  ---------  tokens  ----------  AST  ---------------  IR  ------------  bytecode  ---------------

```

### Lexer

The lexer is a big regex and a switch statement. It is pretty bare bones -- the tokens only include enough information for parsing, and an improved version would include token position information to support better error handling.

### Parser

A recursive descent parser. Also bare-bones -- very little in the way of error handling or recovery, just gives up at the first error. Accepts a language that would be tedious to represent using a traditional LL or LALR parser generator, given the absence of required statement separators.

### Typechecker

Basically the whole project is in here. I've rewritten this like 7 times and expect to rewrite it a couple more. I should probably try to split this into more passes, and let most of the optimization happen in the 'compiler' phase.

### Compiler

I mean isn't the whole thing a compiler? This is, I guess, the dual of the parser -- it flattens a tree into a sequence of tokens. There's not much going on in the way of "optimization" here, though I'm not really all that concerned about performance at this point. Shit, the IR could very well be directly interpreted.

### Interpreter

Actually runs the program. Still need to implement garbage collection, and it would be nice if there were debugging tools besides printing.
