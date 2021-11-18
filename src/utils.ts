// istanbul ignore next
export function noMatch(_: never): never {
  throw new Error("no match");
}

// istanbul ignore next
export const tap = <T>(value: T) => {
  console.log(value);
  return value;
};

export function mapMap<K, V, V2>(
  map: Map<K, V>,
  fn: (value: V, key: K) => V2
): Map<K, V2> {
  return new Map(
    Array.from(map.entries()).map(([key, value]) => [key, fn(value, key)])
  );
}
