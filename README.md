# HarborDeck

[中文说明](README.zh-CN.md)

HarborDeck is a self-hosted start page for people who keep the same services in several places: home, office, a private network, or a public URL. It combines scenes, groups, shared bookmarks, network-aware URLs, and a browser new-tab extension in one small Docker service.

The project is designed for one administrator. There is no guest mode: the page is protected by the administrator login, while a scene may optionally have its own password when its bookmarks should stay out of sight.

## Acknowledgements

HarborDeck grew from [Goalonez/smart-harbor](https://github.com/Goalonez/smart-harbor). Many thanks to the original author for open-sourcing a solid foundation; this repository continues the work with richer scenes, bookmark management, browser-extension integration, and deployment improvements.

## What it does

- Switch between any number of user-created scenes without duplicating bookmark definitions.
- Give each scene its own ordered groups. A shared bookmark can appear in several scenes and in a different group in each scene.
- Store a primary URL and an optional secondary URL for every bookmark. The page probes the configured network and opens the reachable address.
- Import browser bookmarks into a selected scene. Nested browser folders become readable path-based groups instead of losing their hierarchy.
- Add, edit, duplicate, move, multi-select, and delete bookmarks. Removing a bookmark from one scene does not remove it from another; an orphaned definition is cleaned up automatically.
- Add an optional multi-line note to every bookmark.
- Search the current scene, choose Google or another configured search engine, and always send Enter to the selected search engine even when local matches exist.
- Protect scenes with a separate password and keep the unlock only for the current browser session.
- Use the integration API from uTools or another shortcut launcher. A token is required and protected scenes are never returned.
- Use the optional Chrome/Chromium extension to open the navigation page on every new tab and add the current page to one or more scene groups.
- Back up and restore the JSON configuration through WebDAV.

## Screenshots

The screenshots below show the current HarborDeck web UI and browser extension.

![HarborDeck home page](docs/screenshots/home.png)

![Scene management](docs/screenshots/scene-management.png)

![Group management](docs/screenshots/group-management.png)

![Create a bookmark](docs/screenshots/new-bookmark.png)

![Batch add bookmarks](docs/screenshots/batch-add.png)

![Multi-select operations](docs/screenshots/multi-select.png)

![Private scene password protection](docs/screenshots/private-scene-password.png)

![Quickly add a bookmark from the browser extension](docs/screenshots/extension-add-bookmark.png)

![Browser extension settings](docs/screenshots/extension-settings.png)

![Network probe settings](docs/screenshots/network-probe-settings.png)

## Docker deployment

The repository includes a generic Docker Compose configuration for Docker Compose, Synology Container Manager, and other compatible environments. It pulls a prebuilt multi-architecture image from GitHub Container Registry; the deployment host does not need Node.js or a source checkout.

```yaml
services:
  harbor-deck:
    image: ghcr.io/sagesang/harbor-deck:1.4.6
    pull_policy: always
    container_name: harbor-deck
    restart: always
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production
      PORT: "80"
      CONFIG_DIR: /app/config
      TZ: Asia/Shanghai
      HARBORDECK_SEARCH_TOKEN: ${HARBORDECK_SEARCH_TOKEN:-}
    volumes:
      - ./config:/app/config
    security_opt:
      - no-new-privileges:true
```

Deployment steps:

1. Create a host configuration directory, for example `./config`; on Synology, `/volume1/docker/harbor-deck/config` is also suitable.
2. Adjust the host-side path for your environment, then create and start the project from the YAML.
3. Open `http://<server-ip>:8080` and create the administrator account on the first visit.
4. Create scenes and groups in Bookmark Management, then add or import bookmarks.

The container-side path `/app/config` must not be changed. The image is published for `linux/amd64` and `linux/arm64`. Replace `1.4.6` with `latest` only when you intentionally want automatic image updates.

For a direct Docker command:

```bash
docker run -d \
  --name harbor-deck \
  --restart always \
  -p 8080:80 \
  -v ./config:/app/config \
  -e TZ=Asia/Shanghai \
  ghcr.io/sagesang/harbor-deck:1.4.6
```

HTTPS is supported by putting the container behind any reverse proxy, including Synology Reverse Proxy, Caddy, or Nginx Proxy Manager. The application itself listens on HTTP inside the container; TLS termination belongs at the proxy layer.

## Scenes, groups, and imports

Scenes are data, not hard-coded UI choices. In the management page you can create, rename, reorder, set a default, password-protect, or delete them. The home page also provides group context actions for creating a bookmark, editing the group name, or deleting the complete group.

Each scene owns its group list. Bookmarks are shared definitions referenced by group IDs, so the same URL can be placed in both “Home” and “Work” without creating two independent records. When a bookmark is deleted from one scene, only that scene reference is removed. The bookmark record is deleted only when no scene references it.

The import flow asks for a target scene before reading the browser export. A nested folder such as `Bookmarks Bar / Engineering / Frontend` is represented as one group with that full path, so bookmarks remain grouped without requiring a second unsupported folder level in the homepage grid. A root-level bookmark is placed in `Imported Bookmarks`.

## Integration API ([API reference](docs/api.md))

See the complete endpoint reference, request schemas, response examples, and error codes in [`docs/api.md`](docs/api.md).

Set `HARBORDECK_SEARCH_TOKEN` in the container environment. Every request must include:

```http
X-HarborDeck-Search-Token: your-secret-token
```

Search bookmarks for uTools or another launcher:

```bash
curl \
  -H "X-HarborDeck-Search-Token: $HARBORDECK_SEARCH_TOKEN" \
  "http://localhost:8080/api/integrations/bookmarks/search?q=har&sceneId=all"
```

`q` is matched against the bookmark name, slug, primary URL, secondary URL, and note. `sceneId` may be a specific scene ID or `all` (omitted also means all scenes). Password-protected scenes are excluded, even when the administrator has unlocked them in the browser. Each result includes the scene/group context, `name`, and `url`; the secondary URL is returned when present, otherwise the primary URL is used.

The extension popup uses two additional token-protected endpoints:

- `GET /api/integrations/bookmarks/scenes` lists only scenes that can receive a bookmark.
- `POST /api/integrations/bookmarks` accepts `{ name, primaryUrl, secondaryUrl?, note?, placements: [{ sceneId, groupId }] }` and adds the current page to one group per selected scene.

## Browser extension

Build the extension with:

```bash
npm run build:extension
npm run package:extension
```

Install the generated unpacked directory from `chrome://extensions` with Developer mode enabled, or use the ZIP attached to a GitHub release.

The options page accepts:

| Setting | Meaning |
| --- | --- |
| `primaryUrl` | Usually the LAN address |
| `fallbackUrl` | Usually the public/WAN address |
| `openMode=direct` | Redirect the new-tab page to the selected address |
| `openMode=embedded` | Render the navigation page inside the new-tab page |
| `probeTimeoutMs` | Reachability check timeout; default is 200 ms |
| API token | Used by the “add current page” popup |

The extension keeps only the last reachable address and its timestamp in a short-lived local cache. It never caches bookmark definitions or the server configuration. In direct mode, a fresh cache keeps the redirect fast; on a first or expired check, the extension leaves a short input-protection window. Keyboard input, paste, page navigation, or tab hiding cancels the redirect so a URL pasted into the browser address bar is not overwritten. Embedded mode appends `embedded=1` and disables automatic focus in the navigation search box, leaving the browser address bar usable.

## Configuration and security

The mounted directory contains `config.json`. The most important sections are:

| Section | Purpose |
| --- | --- |
| `system` | Theme, app title, click behavior, search engines, and WebDAV backup |
| `navigation.scenes[]` | Scene names, passwords, groups, and ordered bookmark references |
| `navigation.bookmarks[]` | Shared bookmark definitions, URLs, icon, note, and opening behavior |

Passwords are stored as hashes. There is one administrator account and no anonymous mode. A scene password is independent of the admin password and is valid only for a browser session; closing the browser, changing the password, restoring a backup, or restarting the server requires unlocking again. Five failed admin logins trigger a temporary lockout.

Do not commit `config.json`, WebDAV credentials, or the integration token to Git. Keep the mounted config directory backed up separately from the image.

Privacy policy: [`PRIVACY.md`](PRIVACY.md)

## Local development

```bash
npm install
npm run dev
```

- Web client: `http://localhost:3000`
- API server: `http://localhost:3001`

Useful checks:

```bash
npm run lint
npm run test
npm run build
npm run build:extension
```

## Tech stack and license

React 19, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query, Fastify, and Zod.

Licensed under [Apache-2.0](LICENSE).
