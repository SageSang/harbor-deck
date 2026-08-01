import { createHash, randomBytes } from 'node:crypto'

const SCENE_UNLOCK_TTL_MS = 1000 * 60 * 60
const ATTEMPT_WINDOW_MS = 1000 * 60 * 10
const MAX_ATTEMPTS = 5
const BLOCK_MS = 1000 * 60 * 30

interface UnlockRecord {
  sessionKey: string
  sceneId: string
  expiresAt: number
}

interface AttemptRecord {
  count: number
  firstAttemptAt: number
  blockedUntil?: number
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

export function createSceneAccessService() {
  const unlocks = new Map<string, UnlockRecord>()
  const attempts = new Map<string, AttemptRecord>()

  function prune() {
    const now = Date.now()
    unlocks.forEach((record, key) => {
      if (record.expiresAt <= now) {
        unlocks.delete(key)
      }
    })
    attempts.forEach((record, key) => {
      if ((!record.blockedUntil || record.blockedUntil <= now) && record.firstAttemptAt + ATTEMPT_WINDOW_MS <= now) {
        attempts.delete(key)
      }
    })
  }

  function getAttemptKey(sessionKey: string, sceneId: string, ip: string) {
    return `${sessionKey}:${sceneId}:${ip}`
  }

  function ensureCanAttempt(sessionKey: string, sceneId: string, ip: string) {
    prune()
    const record = attempts.get(getAttemptKey(sessionKey, sceneId, ip))
    return !record?.blockedUntil || record.blockedUntil <= Date.now()
  }

  function registerFailure(sessionKey: string, sceneId: string, ip: string) {
    const key = getAttemptKey(sessionKey, sceneId, ip)
    const now = Date.now()
    const current = attempts.get(key)
    if (!current || current.firstAttemptAt + ATTEMPT_WINDOW_MS <= now) {
      attempts.set(key, { count: 1, firstAttemptAt: now })
      return
    }

    const count = current.count + 1
    attempts.set(key, {
      count,
      firstAttemptAt: current.firstAttemptAt,
      blockedUntil: count >= MAX_ATTEMPTS ? now + BLOCK_MS : current.blockedUntil,
    })
  }

  function clearFailures(sessionKey: string, sceneId: string, ip: string) {
    attempts.delete(getAttemptKey(sessionKey, sceneId, ip))
  }

  function issue(sessionKey: string, sceneId: string) {
    prune()
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + SCENE_UNLOCK_TTL_MS
    unlocks.set(hashToken(token), { sessionKey, sceneId, expiresAt })
    return { token, expiresAt }
  }

  function validate(token: string | undefined, sessionKey: string, sceneId: string) {
    prune()
    if (!token) {
      return false
    }
    const record = unlocks.get(hashToken(token))
    return Boolean(
      record &&
        record.sessionKey === sessionKey &&
        record.sceneId === sceneId &&
        record.expiresAt > Date.now()
    )
  }

  function lock(token: string | undefined) {
    if (token) {
      unlocks.delete(hashToken(token))
    }
  }

  return {
    ensureCanAttempt,
    registerFailure,
    clearFailures,
    issue,
    validate,
    lock,
    clear() {
      unlocks.clear()
      attempts.clear()
    },
  }
}
