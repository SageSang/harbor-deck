# Standard extension identities

The public identity source is `shared/extension-identities.json`. The server reads the default IDs from it; manifest generation and packaging validate each public key against its declared ID. Private keys are neither required nor stored.

| Channel | Store / CRX ID | Verification on 2026-09-26 |
| --- | --- | --- |
| [Chrome](https://chromewebstore.google.com/detail/mlnpanpmgplmlangfnokhelkhkfcpine) | `mlnpanpmgplmlangfnokhelkhkfcpine` | Public 1.4.20 CRX retrieved from Google's update endpoint; publisher proof matched the ID and its SHA-256 signature verified |
| [Edge](https://microsoftedge.microsoft.com/addons/detail/ogjfbhbheifoaidpfdbcbcbgfiblmnik) | `ogjfbhbheifoaidpfdbcbcbgfiblmnik` | Owner-supplied public key parsed as RSA SPKI and its derived ID matched; store publication details supplied by the owner |

The Chrome CRX SHA-256 is recorded in the implementation audit. The ID is derived from the first 16 bytes of the public-key SHA-256, with hexadecimal digits mapped to a–p. A public key identifies a browser extension origin; it is not an administrator credential or proof that arbitrary unpacked code comes from the store publisher.

## Build and package

```sh
npm run build:extension
npm run package:extension

EXTENSION_BROWSER=edge npm run build:extension
EXTENSION_BROWSER=edge npm run package:extension
```

Both operations must use the same channel. Each packaging command produces two ZIPs from the same build:

| Channel | Load unpacked (retains `manifest.key`) | Upload to the existing store listing (no `manifest.key`) |
| --- | --- | --- |
| Chrome | `harbor-deck-<tag>.zip` | `harbor-deck-<tag>-store.zip` |
| Edge | `harbor-deck-<tag>-edge.zip` | `harbor-deck-<tag>-edge-store.zip` |

The original ZIP filenames remain the unpacked-installation packages. Do not upload these to the store. Store ZIPs differ only by removing the manifest's `key` field, leaving the built directory and unpacked ZIP untouched. The store assigns/signs the identity of the listing being updated. Upload to the existing Chrome `mlnpanpmgplmlangfnokhelkhkfcpine` or Edge `ogjfbhbheifoaidpfdbcbcbgfiblmnik` entry; creating a new item does not preserve the existing identity or update existing installations. See [Chrome's key documentation](https://developer.chrome.com/docs/extensions/reference/manifest/key) for the development-only ID hint.

Builds are sequential because they share `extension/dist`. Missing or mismatched identity material, unknown channels, wrong-channel packaging and version mismatches fail before packaging replaces an existing artifact. The release workflow attaches all four ZIPs and checks their actual contents: no key in store manifests, correct IDs in unpacked manifests, matching versions and identical remaining files. Run the same check locally with `python3 extension/scripts/verify-packages.py` (`RELEASE_TAG` and `RELEASE_VERSION` override the defaults).

Use unpacked ZIPs for Developer mode, not store ZIPs: removing the key from a local installation may change its ID and storage. Same-channel unpacked packages keep their ID across paths; the two store channels intentionally keep distinct IDs. An old unpacked installation may have a different ID and requires the data-transfer procedure before replacement. Chrome can treat the same ID from another distribution source as the same extension, so do not assume store/unpacked copies can coexist in one profile; keep a recoverable export before switching channels or distribution methods.

## Server behavior and upgrade

Starting with 1.4.21, effective allowed sources are the two standard IDs plus valid entries in `HARBORDECK_TRUSTED_EXTENSION_IDS`. Empty configuration now means no extra IDs. Only the existing `/` and `/index.html` HTML responses with `embedded=1` use this policy. Ordinary pages and API responses keep their existing embedding restriction. Invalid or wildcard IDs are rejected.

The new default does not grant login, expose locked scenes, add broad host permissions, or use the integration token as a login credential. Old servers need an upgrade or one manual standard-ID registration. Custom extensions retain their explicit allowlist path. Reverse proxies that add a restrictive CSP may still block embedding; inspect the final response and verify the actual browser flow.

Standard identity, authentication and CSP behavior were exercised with both identities in isolated Chromium profiles and a real temporary server. Microsoft Edge itself, MacBook, actual store upgrades and production proxy behavior remain separate validation items. Publishing the release and its ZIPs does not deploy a production server or submit a store update.
