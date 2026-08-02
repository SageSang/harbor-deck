import { describe, expect, it } from 'vitest'
import { resolveDirectUrl } from '@/core/navigation/resolveDirectUrl'

describe('resolveDirectUrl', () => {
  it('keeps full http and https urls', () => {
    expect(resolveDirectUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1')
    expect(resolveDirectUrl('http://localhost:3000/test')).toBe('http://localhost:3000/test')
  })

  it('adds https for bare domains', () => {
    expect(resolveDirectUrl('example.com')).toBe('https://example.com/')
    expect(resolveDirectUrl('sub.example.com/docs')).toBe('https://sub.example.com/docs')
  })

  it('adds http for localhost and ip addresses', () => {
    expect(resolveDirectUrl('localhost:5173')).toBe('http://localhost:5173/')
    expect(resolveDirectUrl('192.168.1.10:8080/admin')).toBe('http://192.168.1.10:8080/admin')
  })

  it('returns null for normal search keywords', () => {
    expect(resolveDirectUrl('harbordeck')).toBeNull()
    expect(resolveDirectUrl('just-a-keyword')).toBeNull()
  })

  it('returns null for unsupported protocols', () => {
    expect(resolveDirectUrl('ftp://example.com')).toBeNull()
  })
})
