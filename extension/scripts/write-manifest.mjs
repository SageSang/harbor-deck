import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..', '..')
const extensionDir = path.resolve(rootDir, 'extension')
const distDir = path.resolve(extensionDir, 'dist')

const packageJson = JSON.parse(await fs.readFile(path.resolve(rootDir, 'package.json'), 'utf8'))
const version = process.env.EXTENSION_VERSION || packageJson.version
const extensionIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}

const manifest = {
  manifest_version: 3,
  name: 'HarborDeck',
  version,
  description: 'Use HarborDeck as the Chrome new tab page with automatic primary/secondary URL switching.',
  permissions: ['storage', 'permissions', 'activeTab'],
  optional_host_permissions: ['http://*/*', 'https://*/*'],
  icons: extensionIcons,
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_title: 'HarborDeck Settings',
    default_icon: extensionIcons,
    default_popup: 'popup.html',
  },
  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },
  chrome_url_overrides: {
    newtab: 'newtab.html',
  },
}

await fs.writeFile(path.resolve(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
