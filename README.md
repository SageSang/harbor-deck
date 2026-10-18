<p align="center"><img src="branding/logo.png" width="88" alt="HarborDeck logo"></p>
<h1 align="center">HarborDeck</h1>
<p align="center">Your services, bookmarks, and browser start page — on your own server.</p>
<p align="center"><a href="README.zh-CN.md">简体中文</a> · <a href="https://github.com/SageSang/harbor-deck/releases">Downloads</a> · <a href="docs/bookmark-management-api.md">Management API</a> · <a href="PRIVACY.md">Privacy</a></p>

HarborDeck brings daily websites and self-hosted services into a personal dashboard. Organize them by scene, keep one bookmark shared across several contexts, and use primary and fallback addresses for services you access both at home and away. The optional Chrome and Edge extension turns the same interface into your new-tab page and captures links while you browse.

It is built for a single administrator, with an administrator login for the site and optional passwords for individual scenes. Your configuration lives in a mounted directory; there is no hosted account to register.

![HarborDeck dashboard with demonstration bookmarks](docs/screenshots/overview-2026-10.jpg)

## Make it your daily starting point

| Capability                 | How it helps                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenes and groups          | Separate work, learning, home services, and personal collections. Reorder groups and bookmarks without maintaining several copies of the same link.                            |
| Shared bookmarks           | A bookmark can appear in several scenes, with one group per scene. Editing the shared definition updates all its placements.                                                   |
| Search and keyboard access | Filter the current scene by title, URL, or note; use built-in or custom search engines, arrow-key navigation, `/` to focus search, and Alt+Shift+arrow keys to switch scenes.  |
| Primary and fallback URLs  | Configure LAN/WAN probes and two addresses per service. Open or copy a particular address from the bookmark menu when needed.                                                  |
| Quick records              | Capture now, organize later. Search the inbox, edit notes, and move selected records into a group. Conflicting content is retained until you choose how to handle it.          |
| Bookmark tools             | Edit, duplicate, drag, multi-select, and place bookmarks across scenes. Import browser bookmark HTML; nested folders become path-based groups. Export browser-compatible HTML. |
| Local new-tab page         | The extension packages the frontend locally. Ordinary-scene snapshots support browsing and search during connection failures; online content refreshes in place.               |
| Appearance                 | Choose Frost, Midnight, or Ember, adjust layout, and keep a local theme preference. Both Chinese and English interfaces are included.                                          |
| Backup and automation      | Export configuration, use scheduled or manual WebDAV backups, and connect shortcut launchers or AI tools through separate APIs.                                                |

<table>
<tr><td><img src="docs/screenshots/bookmark-editor-2026-10.jpg" alt="Editing a bookmark and its scene placements"></td><td><img src="docs/screenshots/scene-manager-2026-10.jpg" alt="Managing scenes"></td></tr>
<tr><td align="center">One bookmark, several contexts</td><td align="center">Organize scenes in one place</td></tr>
</table>

Screenshots use demonstration data from the current source build. Features and fixes in source arrive in distributed packages when a corresponding release is published.

## Run with Docker

The published image supports `linux/amd64` and `linux/arm64`. Docker Compose and Synology Container Manager can run it without installing Node.js on the host.

Create `compose.yaml`:

```yaml
services:
  harbor-deck:
    image: ghcr.io/sagesang/harbor-deck:1.4.28
    container_name: harbor-deck
    restart: unless-stopped
    ports:
      - '127.0.0.1:8080:80'
    environment:
      NODE_ENV: production
      PORT: '80'
      CONFIG_DIR: /app/config
      TZ: Asia/Shanghai
    volumes:
      - ./config:/app/config
    security_opt:
      - no-new-privileges:true
```

```bash
docker compose up -d
```

Open `http://localhost:8080` on the Docker host and create the administrator account. To use another device, configure an HTTPS reverse proxy or deliberately bind the port to a trusted LAN interface. The default loopback binding is not reachable directly from another computer. A reverse proxy running in another container needs a reachable upstream, such as a shared Docker network; its own `127.0.0.1` is not the Docker host.

On Synology, use a persistent host directory such as `/volume1/docker/harbor-deck/config` in place of `./config`. Keep the container path `/app/config`. The repository's [Compose file](docker-compose.yml) also includes a health check and optional integration settings.

### Versions and upgrades

The examples currently pin the published **server 1.4.28**. **Extension 1.4.29** is a separate release. A higher extension or source package version does not imply a matching Docker image; check the [release notes](https://github.com/SageSang/harbor-deck/releases) for the component you are upgrading.

Back up the complete mounted configuration directory and record the current image version before upgrading. Change the image tag, then run `docker compose pull` and `docker compose up -d`. Preserve the configuration mount, integration tokens, and any custom port mapping. A restart requires signing in and unlocking scenes again. The `latest` tag moves with server releases; pulling a fixed tag does not upgrade to a different version.

### Optional settings

| Variable                               | Purpose                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `HARBORDECK_SEARCH_TOKEN`              | Enables authenticated shortcut search and bookmark capture for unprotected scenes.                                   |
| `HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN` | Enables AI/automation management with an independent random token of at least 32 characters. Leave empty to disable. |
| `HARBORDECK_TRUST_PROXY`               | Trusted proxy IPs/CIDRs; defaults to `loopback,linklocal,uniquelocal`. Match this to your actual proxy path.         |
| `HARBORDECK_TRUSTED_EXTENSION_IDS`     | Additional trusted embedding identities. Standard HarborDeck Chrome/Edge identities are already included.            |
| `HARBORDECK_WEBDAV_TIMEOUT_MS`         | Complete timeout per WebDAV request: default `15000`, range `100`–`300000` milliseconds.                             |

## Add the browser extension

Install from the existing [Chrome Web Store](https://chromewebstore.google.com/detail/mlnpanpmgplmlangfnokhelkhkfcpine) or [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ogjfbhbheifoaidpfdbcbcbgfiblmnik) listing, or download the appropriate package from [Releases](https://github.com/SageSang/harbor-deck/releases). Store availability may lag a GitHub release.

1. Set the primary HarborDeck URL and, if useful, its fallback URL. Grant access to those origins.
2. Choose the local new-tab page or explicitly select direct navigation to your server. Connection settings belong to this installation and are not synchronized across devices.
3. Sign in with your administrator account for the navigation page. To capture bookmarks from the toolbar, also configure the server's search/capture token in the extension.
4. Use the capture popup to edit the title, URLs, and note, then search for a target scene/group or save a quick record.

Chrome and Edge have separate packages and identities. For manual installation use the corresponding unpacked ZIP; `-store.zip` files are intended for store submission. Update an existing installation in place. Before changing installation identity, use the settings export/import flow; its transfer file excludes the token, which must be entered again.

See [extension setup and recovery](docs/extension-local-settings-and-recovery.md), [package identities](docs/extension-identities.md), and [local cache behavior](docs/bookmark-cache.md).

## Keep control of your data

The site requires administrator authentication. Password-protected scenes add a separate visibility boundary. A bookmark deliberately shared with an ordinary scene is also visible there.

Web pages keep ordinary-scene display snapshots in `localStorage`; the extension uses `chrome.storage.local`. They contain the displayed links and notes, so treat the browser profile as private. Protected scenes are excluded even when unlocked. Offline snapshots are not backups or authorization to edit: editing requires a current online configuration, and offline writes are not queued. Logout or a detected loss of access clears the relevant cache; offline devices cannot instantly learn about remote permission changes.

Use WebDAV for a complete backup. Web configuration exports made while scenes are locked contain only accessible data. A restore replaces the current configuration; keep a fresh backup before restoring an older version. See the [privacy policy](PRIVACY.md) for storage, retention, and transfer details.

## Connect launchers and AI tools

| Interface           | Access                                                                                                                                      | Documentation                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Search and capture  | `X-HarborDeck-Search-Token`; unprotected scenes only. Useful for uTools, launchers, and bookmark capture.                                   | [Integration API](docs/api.md)                                                                       |
| Bookmark management | `X-HarborDeck-Management-Token`; groups, bookmarks, placements, and quick records across all scenes. Supports revision checks and dry runs. | [Management API](docs/bookmark-management-api.md) · [OpenAPI](docs/bookmark-management-openapi.yaml) |

The management token can read and modify bookmarks in protected scenes without administrator login or scene passwords. It cannot manage scene definitions, credentials, system settings, or WebDAV. Enable it only for tools you intend to give that scope, and keep it separate from the capture token. Configuration files and integration tokens should never be committed to Git.

## Develop locally

Use Node.js 24 and npm:

```bash
npm ci
npm run dev
```

The web frontend is at `http://localhost:3000`; the API is at `http://localhost:3001`. Development data defaults to `./config`; set `CONFIG_DIR` to an isolated directory when testing.

```bash
npm test
npm run lint
npm run build
npm run build:extension
npm run package:extension
EXTENSION_BROWSER=edge npm run build:extension
EXTENSION_BROWSER=edge npm run package:extension
```

The project uses React, TypeScript, Vite, Tailwind CSS, Fastify, and Zod. Release tags select the deliverable: `vX.Y.Z-web` for the server, `vX.Y.Z-extension` for extensions, and `vX.Y.Z` for both. Packaging does not submit an extension to either store. See [release instructions](release-notes/README.md).

<details>
<summary>Maintainer context</summary>

Personal maintenance history, decisions, verification status, and open context are maintained in [Sidney Vault](obsidian://open?vault=sidney-vault&file=20-Areas%2F%E8%BD%AF%E4%BB%B6%E9%A1%B9%E7%9B%AE%E7%BB%B4%E6%8A%A4%2F%E5%AE%9E%E4%BD%93%2FHarborDeck%2F%E6%96%87%E6%A1%A3%2F%E8%83%8C%E6%99%AF%E5%AE%9E%E7%8E%B0%E4%B8%8E%E5%8E%86%E5%8F%B2). This repository retains source code, usage documentation, and developer contracts. The Vault is not required to build or use the project.

</details>

## License and origins

HarborDeck is licensed under [Apache-2.0](LICENSE). It originated from [Goalonez/smart-harbor](https://github.com/Goalonez/smart-harbor); thank you to the original author and contributors for the foundation. HarborDeck's ongoing development focuses on scene-based bookmark management, browser integration, and self-hosted operation.
