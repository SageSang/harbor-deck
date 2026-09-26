// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  readIdentities,
  extensionIdFromKey,
  selectIdentity,
  validateIdentities,
  validateBuiltManifest,
} from './identity.mjs'

describe('standard extension identity and packaging guard', () => {
  it('matches the published Chrome and Edge IDs with their public keys', async () => {
    const identities = await readIdentities()
    expect(extensionIdFromKey(identities.chrome.publicKey)).toBe('mlnpanpmgplmlangfnokhelkhkfcpine')
    expect(extensionIdFromKey(identities.edge.publicKey)).toBe('ogjfbhbheifoaidpfdbcbcbgfiblmnik')
  })
  it('rejects missing keys and mismatched identities instead of minting a new identity', async () => {
    const identities = await readIdentities()
    expect(() =>
      validateIdentities({ ...identities, chrome: { ...identities.chrome, publicKey: '' } })
    ).toThrow()
    expect(() =>
      validateIdentities({
        ...identities,
        chrome: { ...identities.chrome, publicKey: identities.edge.publicKey },
      })
    ).toThrow('mismatch')
    expect(() => extensionIdFromKey('not base64')).toThrow()
  })
  it('requires an explicit valid channel and catches packaging the wrong channel or version', async () => {
    const identities = await readIdentities()
    const manifest = { key: identities.chrome.publicKey, version: '1.4.21' }
    expect(selectIdentity(identities).id).toBe(identities.chrome.id)
    expect(() => selectIdentity(identities, 'other')).toThrow('EXTENSION_BROWSER')
    expect(() => validateBuiltManifest(manifest, identities, 'chrome', '1.4.21')).not.toThrow()
    expect(() => validateBuiltManifest(manifest, identities, 'edge', '1.4.21')).toThrow('identity')
    expect(() =>
      validateBuiltManifest({ version: '1.4.21' }, identities, 'chrome', '1.4.21')
    ).toThrow('identity')
    expect(() => validateBuiltManifest(manifest, identities, 'chrome', '1.4.20')).toThrow('version')
  })
})
