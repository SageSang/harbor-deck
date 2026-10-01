import { afterEach, expect, it, vi } from 'vitest'
import { withReadTimeout } from './readTimeout'
afterEach(() => vi.useRealTimers())
it('bounds stalled body reads and aborts the request at five seconds', async () => {
  vi.useFakeTimers()
  let signal: AbortSignal | undefined
  const request = withReadTimeout(undefined, async (next) => {
    signal = next
    return new Promise(() => undefined)
  })
  const assertion = expect(request).rejects.toThrow('Read timed out')
  await vi.advanceTimersByTimeAsync(5000)
  await assertion
  expect(signal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
it('forwards cancellation and clears timers after success', async () => {
  vi.useFakeTimers()
  const controller = new AbortController()
  controller.abort()
  await expect(withReadTimeout(controller.signal, async (signal) => signal.aborted)).resolves.toBe(
    true
  )
  expect(vi.getTimerCount()).toBe(0)
})
