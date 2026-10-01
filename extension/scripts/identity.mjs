import { createHash, createPublicKey } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export function extensionIdFromKey(publicKey) {
  if (typeof publicKey !== 'string' || !publicKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey))
    throw new Error('Invalid extension public key')
  const der = Buffer.from(publicKey, 'base64')
  if (der.toString('base64') !== publicKey) throw new Error('Invalid extension public key encoding')
  createPublicKey({ key: der, format: 'der', type: 'spki' })
  return createHash('sha256')
    .update(der)
    .digest('hex')
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (char) => String.fromCharCode(97 + parseInt(char, 16)))
}

export function validateIdentities(identities) {
  for (const channel of ['chrome', 'edge']) {
    const entry = identities?.[channel]
    if (!entry || !/^[a-p]{32}$/.test(entry.id) || extensionIdFromKey(entry.publicKey) !== entry.id)
      throw new Error(`Extension identity mismatch for ${channel}`)
  }
  return identities
}

export async function readIdentities() {
  return validateIdentities(
    JSON.parse(
      await readFile(new URL('../../shared/extension-identities.json', import.meta.url), 'utf8')
    )
  )
}

export function selectIdentity(identities, channel = 'chrome') {
  if (channel !== 'chrome' && channel !== 'edge')
    throw new Error('EXTENSION_BROWSER must be chrome or edge')
  validateIdentities(identities)
  return identities[channel]
}

export function validateBuiltManifest(manifest, identities, channel, version) {
  const identity = selectIdentity(identities, channel)
  if (manifest.key !== identity.publicKey || extensionIdFromKey(manifest.key) !== identity.id)
    throw new Error(
      'Built extension identity does not match EXTENSION_BROWSER; rebuild before packaging'
    )
  if (manifest.version !== version)
    throw new Error('Built extension version does not match the package version')
}

export function createStoreManifest(manifest, identities, channel, version) {
  // Check the built channel before removing its development-only identity hint.
  validateBuiltManifest(manifest, identities, channel, version)
  const storeManifest = { ...manifest }
  delete storeManifest.key
  return storeManifest
}
