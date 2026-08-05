import { afterEach, describe, expect, it } from 'vitest'
import { readSceneTokens } from './scenePreference'

const SCENE_TOKENS_KEY = 'harbordeck-scene-tokens'

describe('scene token preferences', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('keeps only non-empty string tokens from stored data', () => {
    window.sessionStorage.setItem(
      SCENE_TOKENS_KEY,
      JSON.stringify({ work: 'valid-token', empty: '', invalid: 42 })
    )

    expect(readSceneTokens()).toEqual({ work: 'valid-token' })
  })

  it('rejects arrays and malformed JSON', () => {
    window.sessionStorage.setItem(SCENE_TOKENS_KEY, JSON.stringify(['unexpected']))
    expect(readSceneTokens()).toEqual({})

    window.sessionStorage.setItem(SCENE_TOKENS_KEY, '{')
    expect(readSceneTokens()).toEqual({})
  })
})
