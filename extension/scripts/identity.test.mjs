// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  readIdentities,
  extensionIdFromKey,
  selectIdentity,
  validateIdentities,
  validateBuiltManifest,
  createStoreManifest,
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
  it('keeps the unpacked identity while removing only key from each store manifest', async () => {
    const identities = await readIdentities()
    for (const channel of ['chrome', 'edge']) {
      const manifest = {
        manifest_version: 3,
        key: identities[channel].publicKey,
        version: '1.4.22',
        permissions: ['storage'],
        chrome_url_overrides: { newtab: 'newtab.html' },
      }
      const original = structuredClone(manifest)
      const store = createStoreManifest(manifest, identities, channel, '1.4.22')
      expect(Object.hasOwn(store, 'key')).toBe(false)
      expect({ ...store, key: manifest.key }).toEqual(original)
      expect(manifest).toEqual(original)
    }
  })
  it('refuses a wrong-channel or stale build before producing an anonymous store manifest', async () => {
    const identities = await readIdentities()
    const manifest = { key: identities.chrome.publicKey, version: '1.4.22' }
    expect(() => createStoreManifest(manifest, identities, 'edge', '1.4.22')).toThrow('identity')
    expect(() => createStoreManifest(manifest, identities, 'chrome', '1.4.23')).toThrow('version')
    expect(() =>
      createStoreManifest({ version: '1.4.22' }, identities, 'chrome', '1.4.22')
    ).toThrow('identity')
  })
})
