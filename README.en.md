# DSH Sidebar Annotations

`dsh-sidebar-annotations` is a portable DSH plugin that adds an embedded web preview, element picking, context annotations, and page debugging to the right sidebar. Each annotation keeps the page text, URL, and locator. Multiple annotations appear as a collapsed attachment above the composer and are sent with the next ordinary message.

The plugin is independent of any business project and does not patch a particular mini-program plugin. A local preview plugin can reuse the exported `window.__dshWorkbenchPanels.BrowserPanel` adapter to get the same annotation UI; see [docs/integrating-preview.md](docs/integrating-preview.md).

## Features

- Preview HTTP(S) sites and local development servers in the DSH right sidebar.
- Pick an element, verify the captured text, inspect its CSS locator, and write a comment.
- Picking mode blocks links, buttons, and form actions. Normal page interaction returns after saving, cancelling, or pressing `Esc`.
- Annotate selected text in the page or in DSH conversation/context content.
- Accumulate multiple annotations. A compact attachment above the composer can be hovered or opened to inspect, edit, delete, or send them.
- Inspect console messages, evaluate JavaScript in the page, quote a log, and open Chromium DevTools.
- Register a model-facing `sidebar_browser` tool for open, snapshot, click, fill, evaluate, and debugging actions in the current session's preview.
- Allow mini-program preview plugins to reuse the same panel, annotation store, and composer integration.

## Install

The current DSH Desktop `desktop` profile is managed exclusively by the
Electron application. The CLI rejects `dsh plugin --profile desktop add ...`.
For Desktop, use the checkout installer below. It links the plugin into the
existing desktop profile without replacing other profile entries:

```sh
git clone https://github.com/zhxnix/dsh-sidebar-annotations.git
cd dsh-sidebar-annotations
npm install
node scripts/install.mjs --profile "$HOME/.dsh/profiles/desktop"
```

You can also set `DSH_PROFILE_DIR` instead of passing `--profile`:

```sh
DSH_PROFILE_DIR="$HOME/.dsh/profiles/desktop" node scripts/install.mjs
```

For Web or Headless profiles managed by the CLI, install the GitHub Release
tarball with the official command:

```sh
dsh plugin --profile web add \
  https://github.com/zhxnix/dsh-sidebar-annotations/releases/latest/download/dsh-sidebar-annotations.tgz
```

Replace `web` with a profile supported by your DSH CLI. The
`github:zhxnix/dsh-sidebar-annotations` shorthand varies by DSH version;
the Release tarball and checkout installer are the reliable paths.

The local installer creates only `plugins/dsh-sidebar-annotations` as a link to the checkout and appends a clearly marked loader entry to `cordis.patch.yml`. Existing files and a different plugin with the same path are never overwritten.

## macOS desktop webview

If the installed DSH Desktop already exposes Electron's `webview` tag, the plugin works without an application patch. Older DSH Desktop builds may only provide an iframe fallback. In that mode ordinary page loading can still work, but cross-origin DOM picking, the console, and DevTools are unavailable.

For the full desktop capability, explicitly copy DSH Desktop and patch the copy:

```sh
node scripts/patch-desktop.mjs \
  --input "/Applications/DSH Desktop.app" \
  --output "$HOME/Applications/DSH Sidebar Annotations.app" \
  --codesign
```

An existing app bundle or its `Contents/Resources/app` directory can be patched in place when it is named explicitly:

```sh
node scripts/patch-desktop.mjs --app "$HOME/Applications/DSH Sidebar Annotations.app"
```

The installer exposes the same opt-in operation:

```sh
node scripts/install.mjs \
  --profile "$HOME/.dsh/profiles/desktop" \
  --desktop-patch \
  --desktop-input "/Applications/DSH Desktop.app" \
  --desktop-output "$HOME/Applications/DSH Sidebar Annotations.app" \
  --codesign
```

The original Electron runtime is stored outside the package in `~/.dsh/backups/dsh-sidebar-annotations/`. Restore it with:

```sh
node scripts/patch-desktop.mjs \
  --restore \
  --app "$HOME/Applications/DSH Sidebar Annotations.app"
```

The desktop patch currently supports macOS Electron app bundles only. On other platforms the plugin can still be installed and uses the host's iframe fallback; full DOM picking and DevTools require a host webview implementation. The installer never applies the macOS patch implicitly or to an unrelated application.

## Use

1. Restart DSH and open a session.
2. Open “DSH Sidebar Annotations” or “Web preview and annotations” in the right sidebar.
3. Open a URL, choose “Pick element”, click a target, and write the comment.
4. Use “Save and pick another” to collect several comments. Page interaction returns when annotation mode ends.
5. Select page text and choose “Annotate selection”, or select text in the conversation/context area and use the floating “Add annotation” action.
6. Hover or open the attachment above the composer to inspect, edit, or delete an annotation. The protocol text is not inserted into the editable input; it is attached automatically at send time.

When the composer contains only annotations, the arrow on the annotation attachment sends them. A failed send restores the annotations to the current session for retry.

A mini-program preview plugin that uses `BrowserPanel` follows the same flow. If its renderer adds `data-dsh-source-file` and `data-dsh-source-line`, the annotation also carries the source file and line. That is a template location supplied by the preview compiler, not an inferred business-logic location.

## Integrating a local preview

Once loaded, this plugin exposes:

```js
window.__dshWorkbenchPanels.BrowserPanel
```

A preview plugin can use the component as its tab body and pass an independent `panelKind` and `defaultUrl`. Each preview tab can then remember its own URL while sharing the current session's annotation attachment, context selection, and send behavior. The public contract is described in [docs/integrating-preview.md](docs/integrating-preview.md).

## Uninstall

For a CLI-managed Web or Headless profile:

```sh
dsh plugin --profile web remove dsh-sidebar-annotations
```

For a checkout installation:

```sh
node scripts/install.mjs \
  --uninstall \
  --profile "$HOME/.dsh/profiles/desktop"
```

The checkout uninstall removes only this plugin's link and its marked loader block. It does not delete other profile plugins or configuration. If a desktop patch was used, run the `--restore` command above as a separate step. Deleting the copied app is optional and left to the user. Restart DSH to unload the plugin.

## Development

Node.js `>=22.12.0` is required. The build does not depend on an author's absolute paths:

```sh
npm install
npm run build
npm test
npm pack --dry-run
```

`src/client.js`, `src/style.css`, and the picker/context-selection modules generate the loadable files under `lib/`. The package `files` allowlist excludes local profiles, app copies, and backups.

## Compatibility and limits

- The client targets the DSH 0.1.x sidebar, conversation input, and Cordis slot APIs. Recheck the send API after a DSH upgrade.
- Page content is data supplied by the page being annotated. It must not be treated as plugin instructions.
- Main-document DOM picking is supported. Cross-origin iframes, closed Shadow DOM, and objects inside Canvas cannot be guaranteed to have precise locators.
- Ordinary pages work without source metadata. WXML source lines require the preview renderer to add the source attributes.
- Preview webviews use an independent partition and do not automatically reuse a system-browser login session.

## License

This project is released under the MIT License. The context-selection interaction was adapted from `dsh-select-to-chat`; its license and attribution are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `lib/context-selection.LICENSE`.
