import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(import.meta.dirname, '..', '..')
const extensionDir = path.resolve(rootDir, 'extension')
const distDir = path.resolve(extensionDir, 'dist')

const packageJson = JSON.parse(await fs.readFile(path.resolve(rootDir, 'package.json'), 'utf8'))
const version = process.env.EXTENSION_VERSION || packageJson.version
const artifactTag = process.env.EXTENSION_ARTIFACT_TAG || `v${version}`
const normalizedArtifactTag = artifactTag.startsWith('v') ? artifactTag : `v${artifactTag}`
const packageBaseName = `harbor-deck-${normalizedArtifactTag}`
const packageDir = path.resolve(extensionDir, packageBaseName)
const zipPath = path.resolve(extensionDir, `${packageBaseName}.zip`)

await fs.rm(packageDir, { recursive: true, force: true })
await fs.rm(zipPath, { force: true })
await fs.cp(distDir, packageDir, { recursive: true })

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
        HARBOR_DECK_EXTENSION_PACKAGE_DIR: packageDir,
        HARBOR_DECK_EXTENSION_ZIP_PATH: zipPath,
      },
      windowsHide: true,
    }
  )
} else {
  await execFileAsync('zip', ['-r', zipPath, '.'], {
    cwd: packageDir,
  })
}

process.stdout.write(`${packageDir}\n${zipPath}\n`)
