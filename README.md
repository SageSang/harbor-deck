# Smart Harbor

[中文](README.zh-CN.md)

Smart Harbor is an intelligent start page for personal self-hosted services.

It automatically detects your current network environment and switches between LAN and public URLs to always choose the most suitable access point.

## Preview

### Home Page

![Smart Harbor home page](image/index.png)

### Settings Panel

![Smart Harbor settings panel](image/setting.png)

### Bookmark Manager

![Smart Harbor bookmark manager](image/bookmark.png)

### Chrome New Tab Extension

![Smart Harbor Chrome extension](image/extension.png)

## Why Use It

- Automatic LAN/WAN routing for each bookmark
- Configurable navigation scenes with independent groups and ordering
- Shared bookmark definitions that can be placed in multiple scenes
- Optional per-scene passwords with session-scoped unlocking
- Drag-and-drop bookmark groups with icon support
- Built-in and custom search engines
- WebDAV backup, restore, and version retention
- Password-protected admin panel with lockout protection
- Optional Chrome new tab extension

## Quick Start

### Docker Compose

This repository includes a Synology-friendly `docker-compose.yml`. Put the repository (including the `Dockerfile`) in a Synology Container Manager project directory, change the host config path if needed, and choose **Build and start**.

```yaml
services:
  smart-harbor:
    build:
      context: .
      dockerfile: Dockerfile
    image: smart-harbor:local
    container_name: smart-harbor
    restart: always
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production
      PORT: "80"
      CONFIG_DIR: /app/config
      TZ: Asia/Shanghai
    volumes:
      - /volume1/docker/smart-harbor/config:/app/config
    security_opt:
      - no-new-privileges:true
```

The left side of the volume is a Synology host path. Create `/volume1/docker/smart-harbor/config` first, or replace it with the shared-folder path used on your NAS. The right side (`/app/config`) must stay unchanged.

### Docker Run

```bash
docker run -d \
  --name smart-harbor \
  -p 8080:80 \
  -v ./smart-harbor/config:/app/config \
  smart-harbor:local
```

Then:

1. Open `http://localhost:8080`.
2. Create your admin account on first visit.
3. Create scenes and groups, then add or import bookmarks from the bookmark manager.

## Configuration

On first start, Smart Harbor writes a single `config.json` into your mounted config directory.

- Host path example: `./smart-harbor/config/config.json`
- Container path: `/app/config/config.json`

### Common fields

| Path | What it controls |
| --- | --- |
| `system.appName` | Site title shown in the page header and browser tab |
| `system.darkMode` | Light or dark theme |
| `system.clickOpenTarget` | Where normal clicks open services and search results |
| `system.middleClickOpenTarget` | Where middle-click opens services and search results |
| `system.defaultSearchEngine` | Default engine used by the search box |
| `system.webdavBackup` | Backup destination, schedule, and retention policy |
| `navigation.defaultSceneId` | Scene selected when no device preference exists |
| `navigation.scenes[]` | Configurable scenes and their independent groups |
| `navigation.bookmarks[]` | Shared bookmark definitions referenced by scene groups |

<details>
<summary>Full config reference</summary>

#### `system`

| Path | Description | Notes |
| --- | --- | --- |
| `system.appName` | Application name shown in the UI and browser tab | Default `Smart Harbor` |
| `system.darkMode` | Enables dark theme | `true` or `false` |
| `system.clickOpenTarget` | Open target for normal clicks | `self` or `blank` |
| `system.middleClickOpenTarget` | Open target for middle-click | `self` or `blank` |
| `system.defaultSearchEngine` | Default search engine ID | Must match a built-in or custom engine |
| `system.customSearchEngines[]` | Custom search engine list | Optional |
| `system.customSearchEngines[].id` | Stable custom engine identifier | Lowercase letters, numbers, and hyphens |
| `system.customSearchEngines[].name` | Display name for the custom engine | Non-empty string |
| `system.customSearchEngines[].urlTemplate` | Search URL template | Must include `{keyword}` |
| `system.webdavBackup.url` | WebDAV endpoint URL | Leave empty to disable backup |
| `system.webdavBackup.username` | WebDAV username | Required when backup is configured |
| `system.webdavBackup.password` | WebDAV password or app password | Required when backup is configured |
| `system.webdavBackup.remotePath` | Remote backup folder | Default `/smart-harbor` |
| `system.webdavBackup.autoBackup` | Enables scheduled backup | `true` or `false` |
| `system.webdavBackup.intervalDays` | Days between automatic backups | Integer from `1` to `365` |
| `system.webdavBackup.maxVersions` | Number of remote backup versions to keep | Integer from `1` to `365` |
| `system.auth.username` | Admin username stored after setup | Created from the setup form |
| `system.auth.passwordHash` | Hashed admin password | Never store plaintext here |

#### `navigation`

| Path | Description | Notes |
| --- | --- | --- |
| `navigation.defaultSceneId` | Default scene identifier | Must reference an existing scene |
| `navigation.scenes[]` | Ordered scene list | At least one scene |
| `navigation.scenes[].id` | Stable scene identifier | Lowercase letters, numbers, and hyphens |
| `navigation.scenes[].name` | Scene display name | Non-empty string |
| `navigation.scenes[].protected` | Whether the scene requires an extra password | Boolean |
| `navigation.scenes[].passwordHash` | Server-managed scene password hash | Never store plaintext here |
| `navigation.scenes[].groups[]` | Groups owned by this scene | Ordered array |
| `navigation.scenes[].groups[].bookmarkIds[]` | Bookmark IDs shown in the group | References `navigation.bookmarks[].slug` |
| `navigation.bookmarks[]` | Shared bookmark definitions | A bookmark may be referenced by multiple scenes |
| `navigation.bookmarks[].slug` | Stable bookmark identifier | Lowercase letters, numbers, and hyphens |
| `navigation.bookmarks[].name` | Bookmark display name | Non-empty string |
| `navigation.bookmarks[].icon` | Lucide icon name | Optional |
| `navigation.bookmarks[].primaryUrl` | Preferred address, usually LAN | Required URL |
| `navigation.bookmarks[].secondaryUrl` | Fallback address, usually WAN | Optional URL |
| `navigation.bookmarks[].probes[]` | Probe URLs used to detect network reachability | Optional; one or more URLs |
| `navigation.bookmarks[].forceNewTab` | Always open this bookmark in a new tab | Optional boolean |

</details>

<details>
<summary>Example <code>config.json</code></summary>

```json
{
  "system": {
    "appName": "Smart Harbor",
    "darkMode": false,
    "clickOpenTarget": "self",
    "middleClickOpenTarget": "blank",
    "defaultSearchEngine": "google",
    "customSearchEngines": [
      {
        "id": "my-search",
        "name": "My Search",
        "urlTemplate": "https://example.com/search?q={keyword}"
      }
    ],
    "webdavBackup": {
      "url": "https://dav.example.com/remote.php/dav/files/demo",
      "username": "demo",
      "password": "app-password",
      "remotePath": "/smart-harbor",
      "autoBackup": true,
      "intervalDays": 7,
      "maxVersions": 10
    },
    "auth": {
      "username": "admin",
      "passwordHash": "<generated-after-setup>"
    }
  },
  "navigation": {
    "defaultSceneId": "personal",
    "bookmarks": [
      {
        "slug": "proxmox",
        "name": "Proxmox",
        "icon": "Server",
        "primaryUrl": "http://192.168.1.10:8006",
        "secondaryUrl": "https://proxmox.example.com",
        "probes": ["http://192.168.1.1"],
        "forceNewTab": true
      }
    ],
    "scenes": [
      {
        "id": "personal",
        "name": "Personal",
        "protected": false,
        "groups": [
          {
            "id": "infrastructure",
            "name": "Infrastructure",
            "bookmarkIds": ["proxmox"]
          }
        ]
      }
    ]
  }
}
```

</details>

## Account And Security

- First visit walks you through creating an admin account.
- There is one administrator account and no guest mode.
- Protected scenes are unlocked separately. The browser keeps their token in session storage, while the server expires it after one hour.
- Editing ordinary bookmarks or groups does not end an unlocked scene session. Closing the browser/tab, changing the scene password, restoring a backup, or restarting the server does.
- Remove the `system.auth` section from `config.json` if you need to reset login credentials.
- After 5 failed login attempts, access is locked for 30 minutes.

## Scene And Import Behavior

- Scenes can be created, renamed, copied, reordered, set as default, or deleted from the bookmark manager.
- Each scene owns its groups and group ordering. Bookmark definitions are shared, so one bookmark can be placed in different groups across multiple scenes.
- Adding a bookmark supports one or more `(scene, group)` placements.
- Browser bookmark import first selects one target scene. Nested browser folders are flattened into one-level groups using the full folder path, for example `Bookmarks Bar / Dev / Frontend`. Root bookmarks go to `Imported Bookmarks`.

## Chrome New Tab Extension

Install the Chrome extension when you want every new tab to open Smart Harbor automatically.

- `primaryUrl`: primary URL, usually your LAN URL
- `fallbackUrl`: secondary URL, usually your WAN URL
- `openMode`: `embedded` keeps Smart Harbor inside the new tab page; `direct` redirects immediately
- `probeTimeoutMs`: request timeout for address detection, default `200`
- Clicking the extension toolbar icon opens the settings page

### Install

Install Smart Harbor from the [Chrome Web Store](https://chromewebstore.google.com/detail/smart-harbor/jbghdmdpfmnkincfamcbolbcnlogedad), then click the extension icon to set your Smart Harbor URLs.

### Build Locally

For development or private testing, you can still build the extension locally:

```bash
npm run build:extension
npm run package:extension
```

Generated output:

- Folder: `extension/smart-harbor-v<version>`
- Zip: `extension/smart-harbor-v<version>.zip`

## Known Issues

- On iOS devices, when Smart Harbor is opened over HTTPS, the browser usually cannot probe HTTP LAN addresses from that page. In that case, automatic network detection may not be able to decide correctly between LAN and WAN URLs.
- To work around this limitation, the network status dialog in the top-left corner of the homepage provides three direct options: `Auto detect`, `LAN`, and `WAN`. If detection fails on iOS, switch to the mode you need manually.

## Development

```bash
npm install
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

Useful commands:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

## Tech Stack

React 19, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query, Fastify, and Zod.

## Thanks

Thanks to OpenAI Codex and Claude for supporting implementation, iteration, and documentation work on this project.

## License

[Apache-2.0](LICENSE)
