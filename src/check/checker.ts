import { Trait, Type, BoundType, createType, createVar } from "./types";

export function resolveVar(
  target: Type,
  varName: symbol,
  resolvedValue: BoundType
): Type {
  switch (target.tag) {
    case "var":
      if (target.name !== varName) return target;
      for (const trait of target.traits) {
        const matchingTrait = resolvedValue.traits.find(
          (t) => t.name === trait.name
        );
        if (!matchingTrait) throw new TraitError(resolvedValue, trait);
      }
      return resolvedValue;
    case "type":
      return createType(
        target.name,
        target.parameters.map((p) => resolveVar(p, varName, resolvedValue)),
        target.traits
      );
  }
}

type UnifyResult =
  | { tag: "ok"; value: Type }
  | { tag: "resolveLeft"; varName: symbol; value: BoundType }
  | { tag: "resolveRight"; varName: symbol; value: BoundType };

function unionTraits(left: Trait[], right: Trait[]): Trait[] {
  const map = new Map<symbol, Trait>();
  for (const trait of left) {
    map.set(trait.name, trait);
  }
  for (const trait of right) {
    // TODO: unify trait params if already present
    map.set(trait.name, trait);
  }
  return Array.from(map.values());
}

function unifyInner(left: Type, right: Type): UnifyResult {
  if (left.tag === "var" && right.tag === "var") {
    return {
      tag: "ok",
      value: createVar(left.name, unionTraits(left.traits, right.traits)),
    };
  }

  if (left.tag === "var") {
    return {
      tag: "resolveLeft",
      varName: left.name,
      value: right as BoundType,
    };
  }

  if (right.tag === "var") {
    return {
      tag: "resolveRight",
      varName: right.name,
      value: left as BoundType,
    };
  }

  if (
    left.name !== right.name ||
    left.parameters.length !== right.parameters.length
  ) {
    throw new TypeCheckError(left, right);
  }
  const joinedParams: Type[] = [];

  for (const [i, leftParam] of left.parameters.entries()) {
    const rightParam = right.parameters[i];
    const res = unifyInner(leftParam, rightParam);
    if (res.tag !== "ok") return res;
    joinedParams.push(res.value);
  }

  return { tag: "ok", value: createType(left.name, joinedParams, left.traits) };
}

export function unifyParam(
  left: BoundType,
  index: number,
  right: Type
): BoundType {
  while (true) {
    const res = unifyInner(left.parameters[index], right);
    switch (res.tag) {
      case "ok": {
        const created = createType(left.name, left.parameters, left.traits);
        created.parameters[index] = res.value;
        return created;
      }
      case "resolveLeft":
        left = resolveVar(left, res.varName, res.value) as BoundType;
        break;
      case "resolveRight":
        right = resolveVar(right, res.varName, res.value) as BoundType;
        break;
    }
  }
}

export function unify(
  left: BoundType,
  right: BoundType,
  onResult?: (res: UnifyResult) => void
): BoundType {
  while (true) {
    const res = unifyInner(left, right);
    if (onResult) onResult(res);
    switch (res.tag) {
      case "ok":
        return res.value as BoundType;
      case "resolveLeft":
        left = resolveVar(left, res.varName, res.value) as BoundType;
        break;
      case "resolveRight":
        right = resolveVar(right, res.varName, res.value) as BoundType;
        break;
    }
  }
}

type TraitMap = Map<symbol, Trait[]>;
export function getRequiredTraits(
  type: Type,
  map: TraitMap = new Map()
): TraitMap {
  switch (type.tag) {
    case "var":
      map.set(type.name, type.traits);
      return map;
    case "type":
      type.parameters.forEach((param) => getRequiredTraits(param, map));
      return map;
  }
}

function getName(type: Type): string {
  switch (type.tag) {
    // istanbul ignore next
    case "var": {
      const traitNames = type.traits.map((t) => t.name.description).join(" + ");
      return traitNames
        ? `${type.name.description}: ${traitNames}`
        : type.name.description ?? "";
    }
    case "type":
      return `${type.name.description}/${type.parameters.length}`;
  }
}

export class TypeCheckError extends Error {
  constructor(public left: BoundType, public right: BoundType) {
    super(
      `TypeCheckError: expected ${getName(left)}, received ${getName(right)}`
    );
  }
}

export class TraitError extends Error {
  constructor(public type: BoundType, public trait: Trait) {
    super(
      `TypeCheckError: expected ${getName(type)} to have trait ${
        trait.name.description
      }`
    );
  }
}
