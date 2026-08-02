const LAST_REGULAR_SCENE_KEY = 'harbordeck-last-regular-scene'
const ACTIVE_SCENE_KEY = 'harbordeck-active-scene'
const SCENE_TOKENS_KEY = 'harbordeck-scene-tokens'
const LEGACY_LAST_REGULAR_SCENE_KEY = ['smart', '-harbor-last-regular-scene'].join('')
const LEGACY_ACTIVE_SCENE_KEY = ['smart', '-harbor-active-scene'].join('')
const LEGACY_SCENE_TOKENS_KEY = ['smart', '-harbor-scene-tokens'].join('')

function readStorage(storage: Storage | undefined, key: string, legacyKey?: string) {
  if (!storage) {
    return null
  }

  const current = storage.getItem(key)
  if (current !== null || !legacyKey) {
    return current
  }

  const legacy = storage.getItem(legacyKey)
  if (legacy !== null) {
    storage.setItem(key, legacy)
  }
  return legacy
}

export function readInitialActiveSceneId() {
  if (typeof window === 'undefined') {
    return null
  }
  return (
    readStorage(window.sessionStorage, ACTIVE_SCENE_KEY, LEGACY_ACTIVE_SCENE_KEY) ??
    readStorage(window.localStorage, LAST_REGULAR_SCENE_KEY, LEGACY_LAST_REGULAR_SCENE_KEY)
  )
}

export function readLastRegularSceneId() {
  if (typeof window === 'undefined') {
    return null
  }
  return readStorage(window.localStorage, LAST_REGULAR_SCENE_KEY, LEGACY_LAST_REGULAR_SCENE_KEY)
}

export function readSceneTokens(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const stored = readStorage(window.sessionStorage, SCENE_TOKENS_KEY, LEGACY_SCENE_TOKENS_KEY)
    const parsed = JSON.parse(stored ?? '{}')
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
