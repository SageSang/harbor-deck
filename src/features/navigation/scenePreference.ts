const LAST_REGULAR_SCENE_KEY = 'smart-harbor-last-regular-scene'
const ACTIVE_SCENE_KEY = 'smart-harbor-active-scene'
const SCENE_TOKENS_KEY = 'smart-harbor-scene-tokens'

function readStorage(storage: Storage | undefined, key: string) {
  return storage?.getItem(key) ?? null
}

export function readInitialActiveSceneId() {
  if (typeof window === 'undefined') {
    return null
  }
  return (
    readStorage(window.sessionStorage, ACTIVE_SCENE_KEY) ??
    readStorage(window.localStorage, LAST_REGULAR_SCENE_KEY)
  )
}

export function readLastRegularSceneId() {
  if (typeof window === 'undefined') {
    return null
  }
  return readStorage(window.localStorage, LAST_REGULAR_SCENE_KEY)
}

export function readSceneTokens(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SCENE_TOKENS_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

export function persistSceneState(
  sceneId: string,
  options: { protected: boolean; token?: string }
) {
  if (typeof window === 'undefined') {
    return
  }
  window.sessionStorage.setItem(ACTIVE_SCENE_KEY, sceneId)
  if (!options.protected) {
    window.localStorage.setItem(LAST_REGULAR_SCENE_KEY, sceneId)
  }
  if (options.token) {
    const tokens = readSceneTokens()
    tokens[sceneId] = options.token
    window.sessionStorage.setItem(SCENE_TOKENS_KEY, JSON.stringify(tokens))
  }
}

export function removeSceneToken(sceneId: string) {
  if (typeof window === 'undefined') {
    return
  }
  const tokens = readSceneTokens()
  delete tokens[sceneId]
  window.sessionStorage.setItem(SCENE_TOKENS_KEY, JSON.stringify(tokens))
}
