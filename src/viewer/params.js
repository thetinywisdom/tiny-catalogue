// Default values for a subject's schema. The park uses this for its trees.

export function defaultsFor(subject) {
  return Object.fromEntries(Object.entries(subject.schema).map(([k, d]) => [k, d.value]));
}
