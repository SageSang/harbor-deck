import { createHash, randomBytes } from 'node:crypto'
import { createPasswordAttemptLimiter } from './passwordAttempts.js'

const SCENE_UNLOCK_TTL_MS = 1000 * 60 * 60

interface UnlockRecord {
  sessionKey: string
  sceneId: string
  passwordFingerprint: string
  expiresAt: number
}

interface ScopeGeneration {
  version: number
  expiresAt: number
}

interface UnlockAttempt {
  sessionKey: string
  sceneId: string
  generation: number
  scope: ScopeGeneration
  version: number
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function scopeKey(sessionKey: string, sceneId: string) {
  return JSON.stringify([sessionKey, sceneId])
}

export function createSceneAccessService() {
  const unlocks = new Map<string, UnlockRecord>()
  const scopes = new Map<string, ScopeGeneration>()
  const attempts = createPasswordAttemptLimiter()
  let generation = 0

  function prune() {
    const now = Date.now()
    unlocks.forEach((record, key) => {
      if (record.expiresAt <= now) unlocks.delete(key)
    })
    scopes.forEach((record, key) => {
      if (record.expiresAt <= now) scopes.delete(key)
    })
  }

  function capture(sessionKey: string, sceneId: string): UnlockAttempt {
    prune()
    const key = scopeKey(sessionKey, sceneId)
    let scope = scopes.get(key)
    if (!scope) {
      scope = { version: 0, expiresAt: Date.now() + SCENE_UNLOCK_TTL_MS }
      scopes.set(key, scope)
    }
    scope.expiresAt = Date.now() + SCENE_UNLOCK_TTL_MS
    return { sessionKey, sceneId, generation, scope, version: scope.version }
  }

  function isCurrent(attempt: UnlockAttempt) {
    return (
      attempt.generation === generation &&
      scopes.get(scopeKey(attempt.sessionKey, attempt.sceneId)) === attempt.scope &&
      attempt.version === attempt.scope.version &&
      attempt.scope.expiresAt > Date.now()
    )
  }

  function issue(attempt: UnlockAttempt, passwordHash: string) {
    prune()
    if (!isCurrent(attempt)) return null
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + SCENE_UNLOCK_TTL_MS
    unlocks.set(hashToken(token), {
      sessionKey: attempt.sessionKey,
      sceneId: attempt.sceneId,
      passwordFingerprint: hashToken(passwordHash),
      expiresAt,
    })
    return { token, expiresAt }
  }

  function validate(
    token: string | undefined,
    sessionKey: string,
    sceneId: string,
    passwordHash: string | undefined
  ) {
    prune()
    if (!token || !passwordHash) return false
    const record = unlocks.get(hashToken(token))
    return Boolean(
      record &&
      record.sessionKey === sessionKey &&
      record.sceneId === sceneId &&
      record.passwordFingerprint === hashToken(passwordHash) &&
      record.expiresAt > Date.now()
    )
  }

  function lock(sessionKey: string, sceneId: string) {
    const attempt = capture(sessionKey, sceneId)
    attempt.scope.version += 1
    unlocks.forEach((record, token) => {
      if (record.sessionKey === sessionKey && record.sceneId === sceneId) unlocks.delete(token)
    })
  }

  return {
    capture,
    isCurrent,
    beginAttempt(sceneId: string, ip: string) {
      return attempts.begin(JSON.stringify([sceneId, ip]))
    },
    issue,
    validate,
    lock,
    clear() {
      generation += 1
      unlocks.clear()
      scopes.clear()
      attempts.clear()
    },
  }
}
