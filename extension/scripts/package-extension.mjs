import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readIdentities, createStoreManifest } from './identity.mjs'

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(import.meta.dirname, '..', '..')
const extensionDir = path.resolve(rootDir, 'extension')
const distDir = path.resolve(extensionDir, 'dist')

const packageJson = JSON.parse(await fs.readFile(path.resolve(rootDir, 'package.json'), 'utf8'))
const version = process.env.EXTENSION_VERSION || packageJson.version
const channel = process.env.EXTENSION_BROWSER || 'chrome'
const manifest = JSON.parse(await fs.readFile(path.join(distDir, 'manifest.json'), 'utf8'))
const storeManifest = createStoreManifest(manifest, await readIdentities(), channel, version)
const artifactTag = process.env.EXTENSION_ARTIFACT_TAG || `v${version}`
const normalizedArtifactTag = artifactTag.startsWith('v') ? artifactTag : `v${artifactTag}`
const packageBaseName = `harbor-deck-${normalizedArtifactTag}${channel === 'edge' ? '-edge' : ''}`
const packageDir = path.resolve(extensionDir, packageBaseName)
const storeDir = path.resolve(extensionDir, `${packageBaseName}-store`)

await fs.rm(packageDir, { recursive: true, force: true })
await fs.cp(distDir, packageDir, {
  recursive: true,
  filter: (source) => path.basename(source) !== '@eaDir',
})
await fs.mkdir(path.join(packageDir, 'migration'), { recursive: true })
await fs.copyFile(
  path.join(extensionDir, 'tools/export-legacy-settings.js'),
  path.join(packageDir, 'migration/export-legacy-settings.js')
)
await fs.copyFile(
  path.join(rootDir, 'docs/extension-identities.md'),
  path.join(packageDir, 'migration/extension-identities.md')
)
await fs.copyFile(
  path.join(rootDir, 'docs/bookmark-cache.md'),
  path.join(packageDir, 'migration/bookmark-cache.md')
)
await fs.copyFile(
  path.join(rootDir, 'docs/bookmark-cache-validation-2026-10-01.md'),
  path.join(packageDir, 'migration/bookmark-cache-validation-2026-10-01.md')
)
const migrationGuide = await fs.readFile(
  path.join(rootDir, 'docs/extension-local-settings-and-recovery.md'),
  'utf8'
)
await fs.writeFile(
  path.join(packageDir, 'migration/README.md'),
  migrationGuide.replace(
    '../extension/tools/export-legacy-settings.js',
    'export-legacy-settings.js'
  )
)

// Keep the fixed key in the unpacked package; stores assign/sign the identity
// of the existing listing and must receive a separate manifest without key.
await fs.rm(storeDir, { recursive: true, force: true })
await fs.cp(packageDir, storeDir, {
  recursive: true,
  filter: (source) => path.basename(source) !== '@eaDir',
})
await fs.writeFile(
  path.join(storeDir, 'manifest.json'),
  `${JSON.stringify(storeManifest, null, 2)}\n`
)

for (const directory of [packageDir, storeDir]) {
  const zipPath = `${directory}.zip`
  await fs.rm(zipPath, { force: true })
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Compress-Archive -Path (Join-Path $env:HARBOR_DECK_EXTENSION_PACKAGE_DIR '*') -DestinationPath $env:HARBOR_DECK_EXTENSION_ZIP_PATH -Force",
      ],
      {
        env: {
          ...process.env,
          HARBOR_DECK_EXTENSION_PACKAGE_DIR: directory,
          HARBOR_DECK_EXTENSION_ZIP_PATH: zipPath,
        },
        windowsHide: true,
      }
    )
  } else {
    await execFileAsync('zip', ['-r', zipPath, '.'], {
      cwd: directory,
    })
  }
  process.stdout.write(`${directory}\n${zipPath}\n`)
}
