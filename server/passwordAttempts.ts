const ATTEMPT_WINDOW_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const BLOCK_MS = 30 * 60_000
const CAPACITY = 10_000

interface AttemptRecord {
  failures: number
  inFlight: number
  firstAttemptAt: number
  blockedUntil: number
}

export type PasswordAttemptResult = 'success' | 'failure' | 'cancelled'

/** Reserve before scrypt so concurrent requests cannot all pass an empty failure counter. */
export function createPasswordAttemptLimiter() {
  const records = new Map<string, AttemptRecord>()
  let generation = 0

  function begin(key: string) {
    const now = Date.now()
    records.forEach((record, recordKey) => {
      if (
        record.inFlight === 0 &&
        record.blockedUntil <= now &&
        record.firstAttemptAt + ATTEMPT_WINDOW_MS <= now
      )
        records.delete(recordKey)
    })
    let record = records.get(key)
    if (!record) {
      if (records.size >= CAPACITY) return { retryAfter: 60, finish: null }
      record = { failures: 0, inFlight: 0, firstAttemptAt: now, blockedUntil: 0 }
      records.set(key, record)
    }
    if (record.blockedUntil > now) {
      return {
        retryAfter: Math.max(1, Math.ceil((record.blockedUntil - now) / 1000)),
        finish: null,
      }
    }
    if (record.failures + record.inFlight >= MAX_ATTEMPTS) {
      return { retryAfter: 1, finish: null }
    }
    record.inFlight += 1
    const reserved = record
    const reservedGeneration = generation
    let finished = false
    return {
      retryAfter: 0,
      finish(result: PasswordAttemptResult) {
        if (finished) return
        finished = true
        reserved.inFlight -= 1
        if (records.get(key) !== reserved) return
        if (reservedGeneration !== generation) {
          // A security-state reset clears old failures, but never loses their in-flight slots.
        } else if (result === 'success') {
          reserved.failures = 0
          reserved.blockedUntil = 0
          reserved.firstAttemptAt = Date.now()
        } else if (result === 'failure') {
          reserved.failures += 1
          if (reserved.failures >= MAX_ATTEMPTS) reserved.blockedUntil = Date.now() + BLOCK_MS
        }
        if (reserved.failures === 0 && reserved.inFlight === 0) records.delete(key)
      },
    }
  }

  return {
    begin,
    clear() {
      generation += 1
      records.forEach((record, key) => {
        record.failures = 0
        record.blockedUntil = 0
        record.firstAttemptAt = Date.now()
        if (record.inFlight === 0) records.delete(key)
      })
    },
  }
}
