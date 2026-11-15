/** Every leaf path: `home.title`, `legal.docs.terms.sections.0.body.1`. */
export function leaves(node: unknown, path = ""): Map<string, string> {
  if (typeof node === "string") return new Map([[path, node]])
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(node as object)) {
    for (const [p, v] of leaves(value, path ? `${path}.${key}` : key)) out.set(p, v)
  }
  return out
}
