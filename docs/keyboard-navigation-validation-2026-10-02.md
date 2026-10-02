# Bookmark arrow navigation — 2026-10-02

The report of Docker Hub → Down → iKuai skipping Synology was reproduced in both the original selector and the actual built 1.4.22 page. The fixture uses synthetic bookmarks with the screenshot's 4/3/10/2/5 group sizes; no production configuration was accessed.

## Cause and change

The old vertical ranking minimized horizontal center distance before vertical distance. Compact groups and wrapping groups have slightly different card widths, so a distant iKuai card could align exactly while the adjacent DSM card was offset by several pixels. The old horizontal row threshold also spanned neighboring rows and could prefer a slightly offset card above or below over the intended horizontal neighbor.

The selector now chooses the adjacent visual row first for Up/Down, then the nearest horizontal center within that row. Left/Right candidates must actually share the visual row; when no neighbor exists, the original reading-order wrapping is retained. Row membership uses substantial vertical overlap, tolerating small hover offsets and card-height differences without treating a whole neighboring row as aligned. Zero-sized and missing elements are excluded, and layout is read on every keypress.

This changes only the webpage's target selector and its tests. Existing entry/return-to-search handling, activation, editing, cache bridge, extension files and configuration formats are unchanged. Package version is 1.4.23, published through the web-only release path.

## Verification

- Original implementation: four added regression cases failed, including the exact Docker Hub → iKuai symptom, horizontal jumps, skipped short rows and hidden-element targeting.
- Updated implementation: all nine selector tests pass, including reverse movement, edge wrapping and responsive geometry changes. The full suite passes 356 tests, with lint and web/server builds passing.
- Actual built application: isolated Linux Chrome 152.0.7977.82, temporary server, synthetic account and bookmarks. The original page focused iKuai; the fixed page focused DSM.
- At widths 1531, 1920, 1280, 1100, 900, 700 and 390 pixels, all 24 visible cards were checked in each of four directions (672 moves). Expected rows were independently derived from rendered top positions rather than the selector's overlap calculation.
- Additional browser checks cover both directions across the two-row Synology group; collapsing the intervening group; search exposing matching cards from a collapsed group; empty results; search-to-first/last-card, return-to-search and Escape; and modified arrow keys.

Scripts, geometry captures, screenshots and reports are retained outside the repository in the task artifact directory `harbordeck-arrow-navigation-20261002`. These checks do not establish production, physical Mac or Microsoft Edge acceptance. No production deployment is included.
