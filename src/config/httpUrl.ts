export function isHttpUrl(value: string) {
  try {
    const protocol = new URL(value.trim()).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
