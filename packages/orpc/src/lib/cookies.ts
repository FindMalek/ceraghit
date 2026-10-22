export function readCookie(headers: Headers, name: string): string | undefined {
  for (const part of headers.get("cookie")?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=")
    if (key === name) return decodeURIComponent(value.join("="))
  }
  return undefined
}

export function serializeCookie(name: string, value: string, opts: { expires: Date; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${opts.expires.toUTCString()}`,
    opts.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ")
}
