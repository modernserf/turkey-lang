# Array

- Array is a fundamental type.
- Arrays are mutable, and all mutable values are ultimately backed by arrays.
- Arrays have a fixed size, and the size is part of the type; `Array[Int; 4]` and `Array[Int; 8]` are distinct, incompatible types. Arrays cannot be resized.
- Array values can only be get/set through constant indexes, ie. there is `arr:3` but no `arr.get(index)`. These are statically checked and will never cause runtime errors.
- Arrays have very few methods and are mostly used via Vecs

# Vec

- Vec is also a fundamental type.
- Vecs are indexable, resizable windows into arrays.
- Vecs are implemented as [size, capacity, array pointer].
- Vecs with the same type but different sizes/capacities are type-compatible.
- Vecs can be indexed like `vec:3` (which panics on out-of-bounds), or like `vec.get(index)` (which returns an Option type).
- Vecs have many methods and can be converted further into Iter, the lazy iterator type
- Most other mutable data structures (e.g. HashMaps) are implemented in terms of Vec, not Array

# Iter

- Iter is a built-in type and is used for `for` loops (TODO: and generators) but could be implemented in userland
- Iter like a linked list, but the tail of a Cons pair is a 0-arity function that returns the next Iter
- Do collections implement a trait that produces iters, or are iters produced explicitly?
