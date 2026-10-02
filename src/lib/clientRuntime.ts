/** The web app uses same-origin APIs; the packaged new tab supplies one server binding. */
export interface ClientRuntime {
  source: () => string
  prepare: () => Promise<void>
  cache: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  openSettings: () => void
  beforeCacheClear?: (accessLost: boolean) => void
}
let runtime: ClientRuntime | undefined
export function configureClientRuntime(value: ClientRuntime) {
  runtime = value
}
export function isLocalNewTab() {
  return Boolean(runtime)
}
export function clientSource() {
  return runtime?.source() ?? location.href
}
export function clientStorage() {
  return runtime?.cache ?? localStorage
}
export function preferenceKey(key: string) {
  return runtime ? `${key}:${runtime.source()}` : key
}
export function prepareApi() {
  return runtime?.prepare() ?? Promise.resolve()
}
export async function fetchApi(path: string, options?: RequestInit) {
  await prepareApi()
  return fetch(runtime ? new URL(path, runtime.source()) : path, {
    ...options,
    credentials: runtime ? 'include' : 'same-origin',
  })
}
export function openConnectionSettings() {
  runtime?.openSettings()
}

export function prepareCacheClear(accessLost: boolean) {
  runtime?.beforeCacheClear?.(accessLost)
}
