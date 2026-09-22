# Installation and recovery

This document covers the two supported installation modes. The first uses
the DSH plugin manager. The second is for a GitHub checkout or local
development and intentionally makes only small, marked profile changes.

## DSH plugin manager

The current DSH Desktop `desktop` profile is managed exclusively by the
Electron application. The CLI rejects `dsh plugin --profile desktop add ...`.
For Desktop, use the local checkout method below.

For Web or Headless profiles managed by the CLI, install the GitHub Release
tarball:

```sh
dsh plugin --profile web add \
  https://github.com/zhxnix/dsh-sidebar-annotations/releases/latest/download/dsh-sidebar-annotations.tgz
```

After the release is available in the configured registry, the package name
can be used for a CLI-managed profile:

```sh
dsh plugin --profile web add dsh-sidebar-annotations@latest
```

Use `dsh plugin --profile web remove dsh-sidebar-annotations` for a
CLI-managed profile. The DSH command updates the selected profile's package
manifest; restart DSH and create a new session after a change.

## Local checkout

The local installer accepts a profile directory or a bare built-in profile
name:

```sh
cd dsh-sidebar-annotations
npm install
node scripts/install.mjs --profile "$HOME/.dsh/profiles/desktop"
# A bare profile name is also accepted:
# node scripts/install.mjs --profile desktop
```

`DSH_PROFILE_DIR` is equivalent to `--profile`. The installer builds and
syntax-checks `lib/client.js`, then:

1. creates `plugins/dsh-sidebar-annotations` as a symlink to this checkout;
2. appends one loader block between
   `# dsh-sidebar-annotations:start` and `# dsh-sidebar-annotations:end`;
3. leaves every other profile line untouched.

If that plugin path already exists and does not point to the current checkout,
the installer stops instead of replacing it. The same rule applies to an
existing loader id.

Remove the checkout integration with:

```sh
node scripts/install.mjs --uninstall --profile "$HOME/.dsh/profiles/desktop"
```

Only the link and the installer's exact marked block are removed. A manually
written loader entry with the same id is intentionally left for the owner to
review.

## Optional macOS desktop patch

The plugin installer never patches a desktop app unless `--desktop-patch` is
present. The direct patch command is easier to audit:

```sh
node scripts/patch-desktop.mjs \
  --input "/Applications/DSH Desktop.app" \
  --output "$HOME/Applications/DSH Sidebar Annotations.app" \
  --codesign
```

The source application is copied to the output path. An existing output is
used as-is for an idempotent rerun and is never overwritten by the source. An
existing application can instead be named explicitly:

```sh
node scripts/patch-desktop.mjs --app \
  "$HOME/Applications/DSH Sidebar Annotations.app"
```

The runtime backup is keyed by the target app path and stored outside the
checkout at `~/.dsh/backups/dsh-sidebar-annotations/` (or in `--backup-dir`).
Restore the original runtime with the same target and backup directory:

```sh
node scripts/patch-desktop.mjs \
  --restore \
  --app "$HOME/Applications/DSH Sidebar Annotations.app"
```

The patch is currently macOS-only because it edits an Electron app bundle.
The web plugin itself can run on another platform when the host provides the
required DSH webview; otherwise it shows the ordinary iframe fallback and
cannot offer cross-origin DOM inspection or DevTools.

## Updating

For a checkout, pull the source and run the installer again. The profile link
continues to point to the same checkout and the marked loader is not appended
twice. If the DSH application is updated, rerun the explicit desktop patch
against a fresh app copy rather than patching an unknown build.
