// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPasswordAttemptLimiter } from './passwordAttempts.js'

afterEach(() => vi.useRealTimers())

describe('password attempt reservations', () => {
  it('retains other in-flight reservations when one attempt succeeds or is cancelled', () => {
    const limiter = createPasswordAttemptLimiter()
    const attempts = Array.from({ length: 5 }, () => limiter.begin('client'))
    expect(limiter.begin('client').finish).toBeNull()
    attempts[0].finish!('success')
    const next = limiter.begin('client')
    expect(next.finish).not.toBeNull()
    expect(limiter.begin('client').finish).toBeNull()
    attempts[1].finish!('cancelled')
    expect(limiter.begin('client').finish).not.toBeNull()
    expect(limiter.begin('client').finish).toBeNull()
    attempts[1].finish!('cancelled')
    expect(limiter.begin('client').finish).toBeNull()
  })

  it('keeps the existing failure window and thirty-minute ban, then permits recovery', () => {
    vi.useFakeTimers()
    const limiter = createPasswordAttemptLimiter()
    for (let index = 0; index < 4; index += 1) limiter.begin('client').finish!('failure')
    vi.advanceTimersByTime(10 * 60_000 + 1)
    for (let index = 0; index < 5; index += 1) limiter.begin('client').finish!('failure')
    expect(limiter.begin('client').retryAfter).toBe(1800)
    vi.advanceTimersByTime(30 * 60_000)
    expect(limiter.begin('client').finish).not.toBeNull()
  })

  it('clears failures while retaining occupied slots and discarding their old outcomes', () => {
    const limiter = createPasswordAttemptLimiter()
    const pending = Array.from({ length: 5 }, () => limiter.begin('client'))
    limiter.clear()
    expect(limiter.begin('client').finish).toBeNull()
    pending.forEach((attempt) => attempt.finish!('failure'))
    expect(limiter.begin('client').finish).not.toBeNull()
  })
})
