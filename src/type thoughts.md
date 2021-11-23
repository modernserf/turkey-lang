A type has:

- A name (which is shared between compatible types)
- A collection of type parameters (which may be types or type variables)
  These are also associated with types:
- a mapping of traits to implementations
- a mapping of keys to types/type variables that may correspond with type parameters (eg struct, tuple fields)
- a function's type parameter list (distinct from the type's parameter list, which map onto its _value_ parameters)

Type variables stand in for types. They may have a list of trait constraints (ie they can only bind to types that implement those traits)

"abstract type": type of struct definition, has unbound type variables
"concrete type": type of a particular struct, has (fewer) unbound type variables
unification:

- type variables are linked to types (or other type vars)
  - vars are dereferenced before they are bound, so loops ought to be impossible
- type names are compared
- parameters are recursively unified
- traits stuff:
  - if a type var links to another type var, they get the (union? intersection?) of their constraints
  - if a type var links to a type, the type must support all of the traits the var requires
  - compatible types should inherently have compatible traits

resolution:
Type variables are dereferenced until they produce a type, and each of a type's parameters are recursively resolved,
producing a new concrete-ified type.

struct definition

```
struct Foo <T> {
  bar: Int,
  baz: T
}
```

creates this abstract type:

```
{ name: Foo, parameters: [T] }
```

and this associated field map:

```
{ bar => Int, baz => T }
```

struct construction

```
let foo = Foo { bar: 1, baz: "hello" }
```

creates this field map:

```
{ bar => Int, baz => String }
```

which it unifies with the abstract field map,
creating the type variable mapping:

```
{ T => String }
```

the abstract type parameters are resolved using this mapping,
producing the concrete type:

```
{ name: Foo, parameters: [String] }
```

field access

```
foo:bar
foo:baz
```

(if concrete field map is not cached)
foo's abstract type and field map are looked up by their shared type name:

```
{ name: Foo, parameters: [T] }
{ bar => Int, baz => T }
```

the concrete and abstract types are unified,
creating a type variable mapping:

```
{ name: Foo, parameters: [T] }
{ name: Foo, parameters: [String] }
{ T => String }
```

The accessed fields on the abstract field map are resolved using this mapping,
producing concrete types for the fields:

```
{ bar => Int, baz => T => String }
```

function types

```
func get_baz<BazType> (foo: Foo<BazType>): BazType {
  return foo:baz
}
```

creates this type:

- return type as first parameter, input parameters following
- func names are automatically generated and are common for all funcs of a given arity
- no unification or anything, just construct a new compatible type

```
{
  name: Func(1),
  parameters: [
    BazType,
    { name: Foo, parameters: [BazType] }
  ]
}
```

and this mapping of type parameters, which are bound to unique "tracer" types while typechecking the body.
Tracer types implement whatever trait constraints are assoicated with the type vaer.

```
{ BazType => TraceBazType }
```

the function body is checked:

- the type of each parameter is bound to a corresponding variable
- func type parameters are unified with their tracer types
- each return value is unified with the return type
- no types are resolved, and the tracer type is discarded; we're just checking for compatibility

function calls

```
get_baz(Baz { bar: 1, baz: "hello" })
```

first, we unify the parameter type with the arguments:

```
{ name: Foo, parameters: [BazType] }
{ name: Foo, parameters: [String] }
{ BazType => String }
```

then we resolve the return type from `BazType` to `String`.

enums

```
enum List <T> {
  Nil
  Cons(T, List<T>),
}
```

creates the type:

```
{ name: List, parameters: [T] }
```

with the associated enum tag -> field -> type map:

```
{
  Nil => (),
  Cons => (T, { name: List, parameters: [T] })
}
```

constructing enums

`Nil` creates an empty field tuple, which unifies with the Nil branch's empty tuple in the above field map.
Resolving the List type has no change:

```
{ name: List, parameters: [T] }
```

`Cons(1, Nil)` creates the corresponding tuple, which unifies with the Cons branch's tuple in the field map.
resolving the List type produces a more concrete type:

```
(Int, List<T>) * (T, List<T>) -> { T => Int }
{ type: List, parameters: [Int] }
```

match

```
match (Cons(1, Nil)) {
  Cons(x, _) => x,
  Nil => 0,
}
```

the match block is checked (if expressions work similarly):

- each case of the enum is represented exactly once
- in each case, the type of each field is bound to a corresponding variable
- the block results are unified with each other to provide a coherent result type
- the type of the expression is this value resolved

unifying and resolving the results allows you to synthesize a fully concrete type from multiple semi-abstract types:

```
let t = if (some_bool) {
  Left(1) // has type Either<Int, R>
} else {
  Right("foo") // has type Either<L, String>
}
t // has type Either<Int, String>
```

modules, traits, implementations

A module is a collection of types and values:

```
module FooModule {
  pub struct Bar<T> { value: T }
  pub x = 123
  pub func baz (): String { "hello" }
}
```

it has an associated type and a mapping of public members to types:

```
{ name: FooModule, parameters: [] }
{ Bar => Bar<T>, x => Int, baz: func (): String }
```

a trait is a sort of abstract module, which provides types but no implementations, and refers to an implicit `Self` type variable:

```
trait Debug {
  func print(Self): String
}
```

it has an associated type & type mapping as well:

```
{ name: Debug, parameters: [Self] }
{ print => func (Self): String }
```

an implementation is a module that provides implementations matching a Trait's definition, where a particular type will be substituted for `Self`. Self can also be referred to here as a (lexical) alias for the concrete type:

```
struct User {
  name: String
}

impl Debug for User {
  func print(user: Self): String {
    return user:name
  }
}
```

and has the associated type & mapping:

```
{ name: Debug, parameters: [User] }
{ print => func (User): String }
```

when an impl is declared for a trait, their types and maps are unified.

traits and impls can also be parameterized, and those parameters are additional type vars:

```
trait Foo <T> { ... }                   -> { name: Foo, parameters: [Self, T] }
impl Foo<Int> for Int { ... }           -> { name: Foo, parameters: [Self, Int] }
impl <U> Foo<U> for List<U> { ... }     -> { name: Foo, parameters: [Self, U] }
```

Calling trait functions

```
Debug::print(User { name: "Bob" })
```

first, get the Self type by unifying the func parameters with its arguments,
and then resolving Self:

```
{ name: Func(1), parameters: [String, Self] }
{ name: Func(1), parameters: [String, User] }
{ Self => User }
```

Find the implementation of Debug for User, and call that version of print.

trait constraints

```
func print<T: Debug> (value: T): Void {
  Debug::print(T)
}
```

When this is typechecked, T is replaced with a tracer type that implements Debug. When it's compiled, however,
each call site needs to provide the implementation for T's Debug, which is determined by the provided concrete type. This ends up working a little bit like function upvalues -- these functions have additional hidden parameters for each type parameter's trait impls.

`dyn` traits

```
trait Foo { ... }
func get_foo <F: Foo>(value: F): dyn Foo {
  return dyn Foo(value)
}
```

`dyn Foo` is an opaque type that implements Foo but has no other properties.
It allows some additional levels of polymorphism, such as combining values of different types into a single collection.
Any value that implements the Foo trait can be transformed into a `dyn Foo`.

Internally, an instance of `dyn Foo` is implemented as a struct that contains a reference to the original value
and its implementation of Foo. When a function expecting a generic Foo value is called with a `dyn Foo` instance, its attached implementation is provided as a hidden parameter.

```
func print<T: Debug> (value: T): Void {
  Debug::print(T)
}
print(User { name: "bob" })

// -->
print({ Debug => (impl Foo for User) }, User { name: Bob })
```

```
let t = dyn Foo(User { name: "bob" })
print(t)
// -->
let t = { impl: (impl Foo for User), value: User { name: "bob" } }
print({ Debug => t:impl }, t:value)
```

typechecking lambdas

how would we handle this code?

```
func map<T, U> (list: List<T>, mapper: func (T): U): List<U> {
  match (list) {
    Nil => Nil,
    Cons(head, tail) => Cons(mapper(head), tail.map(mapper)),
  }
}
[1,2,3].map(|x| x + 1)
```

all the above is fine up until we hit the lambda -- with function declarations, we have the types up-front, and we check the body matches. But with lambdas, we don't have any type information.

We have enough information to figure out this lambda's type:

- first arg is `List<Int>`, therefore
- at this call site, `{ T => Int }`
- if `x` is of type `Int`, then the lambda is of type `func (Int): Int`
- now we can unify the next type parameter, resulting in `{ T => Int, U => Int }`
- and the resolved return type is `List<Int>`

Unfortunately, this disrupts the straightforward flow of typechecking -- instead of a clean bottom-up check, we now need information from the parent (and, in some cases, sibling) nodes in order to typecheck the lambda.

So when typechecking an expression, need to also pass in context for the parent expression:

- the checker context (ie map of already unified vars)
- the type that we are unifying against

Only some expressions have context, eg in:

```
let foo = |x| x + 1   // no context passed in, check fails
let bar: func (Int): Int = |x| x + 1 // type passed in
```

context is built left to right, so `map([1,2,3], |x| x + 1)` checks, but `map(|x| x + 1, [1,2,3])` does not.
