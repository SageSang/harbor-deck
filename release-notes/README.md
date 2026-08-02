# Release notes

This directory contains the Markdown body used by the GitHub release workflow. A release file name must exactly match its tag:

```text
release-notes/v1.4.5.md
release-notes/v1.4.5-extension.md
release-notes/v1.5.0.md
```

The tag suffix controls the release channel:

- no suffix: publish the web image and the extension;
- `-web`: publish the web image only;
- `-extension`: publish the extension only.

Every release note should be short, user-facing, and bilingual:

```md
## 中文

- 可感知的更新 1
- 可感知的更新 2

## English

- User-visible change 1
- User-visible change 2
```

The workflow appends extension-download guidance when a web-only release does not contain a new extension asset.
