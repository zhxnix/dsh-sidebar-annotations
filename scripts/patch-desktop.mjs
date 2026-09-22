#!/usr/bin/env node

/**
 * Opt-in macOS Electron patch for DSH Desktop.
 *
 * The plugin itself is safe to install into any DSH profile. This file is
 * separate because older DSH Desktop builds do not expose the Electron
 * <webview> tag to their renderer. When requested, it patches an explicitly
 * named app (or a copy made from an explicitly named app) and stores the
 * original runtime outside this package so the operation can be reversed.
 */

import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import {homedir} from 'node:os'
import {basename, dirname, join, resolve} from 'node:path'

const DEFAULT_BACKUP_ROOT = join(homedir(), '.dsh', 'backups', 'dsh-sidebar-annotations')

const MARKERS = Object.freeze({
  baseWindow: 'dsh-sidebar-annotations:webview-tag:base',
  contentView: 'dsh-sidebar-annotations:webview-tag:content',
  helper: 'dsh-sidebar-annotations:webview-helper',
  rendererStart: 'dsh-sidebar-annotations:renderer-webview-patch:start',
  rendererEnd: 'dsh-sidebar-annotations:renderer-webview-patch:end',
})

const BASE_WINDOW_NEEDLE = `\t\twebPreferences: {
\t\t\tpreload,
\t\t\tcontextIsolation: true,
\t\t\tnodeIntegration: false,
\t\t\tsandbox: true,
\t\t\twebSecurity: true,
\t\t\tpartition: DESKTOP_RENDERER_SESSION_PARTITION
\t\t}`

const BASE_WINDOW_REPLACEMENT = `\t\twebPreferences: {
\t\t\tpreload,
\t\t\tcontextIsolation: true,
\t\t\tnodeIntegration: false,
\t\t\tsandbox: true,
\t\t\twebSecurity: true,
\t\t\t/* ${MARKERS.baseWindow} */
\t\t\twebviewTag: true,
\t\t\tpartition: DESKTOP_RENDERER_SESSION_PARTITION
\t\t}`

const CONTENT_VIEW_NEEDLE = `\t\tthis.content = new WebContentsView({ webPreferences: {
\t\t\tpreload,
\t\t\tpartition: DESKTOP_RENDERER_SESSION_PARTITION,
\t\t\tcontextIsolation: true,
\t\t\tnodeIntegration: false,
\t\t\tsandbox: true,
\t\t\twebSecurity: true
\t\t} });`

const CONTENT_VIEW_REPLACEMENT = `\t\tthis.content = new WebContentsView({ webPreferences: {
\t\t\tpreload,
\t\t\tpartition: DESKTOP_RENDERER_SESSION_PARTITION,
\t\t\tcontextIsolation: true,
\t\t\tnodeIntegration: false,
\t\t\tsandbox: true,
\t\t\twebSecurity: true,
\t\t\t/* ${MARKERS.contentView} */
\t\t\twebviewTag: true
\t\t} });`

const HELPER_NEEDLE = 'const DESKTOP_RENDERER_SESSION_PARTITION = "persist:dsh-desktop-renderer";'

const HELPER_REPLACEMENT = `${HELPER_NEEDLE}
const DSH_WORKBENCH_WEBVIEW_PARTITION = "persist:dsh-workbench";
/* ${MARKERS.helper} */
function isDshWorkbenchHttpUrl(value) {
\tif (typeof value !== "string") return false;
\ttry {
\t\tconst target = new URL(value);
\t\treturn target.protocol === "http:" || target.protocol === "https:";
\t} catch {
\t\treturn false;
\t}
}`

const RENDERER_NEEDLE = `\t\tconst renderer = this.compatibilityShell?.webContents ?? window.webContents;
\t\tconst chrome = this.compatibilityShell?.chromeWebContents ?? window.webContents;
\t\tthis.renderer = renderer;`

const RENDERER_REPLACEMENT = `\t\tconst renderer = this.compatibilityShell?.webContents ?? window.webContents;
\t\tconst chrome = this.compatibilityShell?.chromeWebContents ?? window.webContents;
\t\tthis.renderer = renderer;
\t\t/* ${MARKERS.rendererStart} */
\t\tconst dshWorkbenchWillAttachWebview = (event, webPreferences, params) => {
\t\t\tif (!isDshWorkbenchHttpUrl(params.src)) {
\t\t\t\tevent.preventDefault();
\t\t\t\treturn;
\t\t\t}
\t\t\tdelete webPreferences.preload;
\t\t\twebPreferences.nodeIntegration = false;
\t\t\twebPreferences.nodeIntegrationInSubFrames = false;
\t\t\twebPreferences.contextIsolation = true;
\t\t\twebPreferences.sandbox = true;
\t\t\twebPreferences.webSecurity = true;
\t\t\twebPreferences.partition = DSH_WORKBENCH_WEBVIEW_PARTITION;
\t\t};
\t\tconst dshWorkbenchDidAttachWebview = (_event, guestContents) => {
\t\t\tconst guardNavigation = (event, url) => {
\t\t\t\tif (!isDshWorkbenchHttpUrl(url)) event.preventDefault();
\t\t\t};
\t\t\tguestContents.on("will-navigate", guardNavigation);
\t\t\tguestContents.on("will-redirect", guardNavigation);
\t\t\tguestContents.setWindowOpenHandler(({ url }) => {
\t\t\t\tif (isDshWorkbenchHttpUrl(url)) {
\t\t\t\t\tvoid guestContents.loadURL(url).catch(() => {});
\t\t\t\t}
\t\t\t\treturn { action: "deny" };
\t\t\t});
\t\t};
\t\trenderer.on("will-attach-webview", dshWorkbenchWillAttachWebview);
\t\trenderer.on("did-attach-webview", dshWorkbenchDidAttachWebview);
\t\t/* ${MARKERS.rendererEnd} */`

const CLEANUP_NEEDLE = `\t\t\tif (!renderer.isDestroyed()) renderer.ipc.removeHandler(DESKTOP_RENDERER_ACTION_CHANNEL);`

const CLEANUP_REPLACEMENT = `\t\t\trenderer.off("will-attach-webview", dshWorkbenchWillAttachWebview);
\t\t\trenderer.off("did-attach-webview", dshWorkbenchDidAttachWebview);
${CLEANUP_NEEDLE}`

function usage() {
  console.log(`Usage:
  node scripts/patch-desktop.mjs --input SOURCE.app --output COPY.app [--codesign]
  node scripts/patch-desktop.mjs --app APP.app [--codesign]
  node scripts/patch-desktop.mjs --restore --app APP.app

Options:
  --input PATH          Existing DSH Desktop.app to copy (macOS only).
  --output PATH         New app path to create or reuse for the copied patch.
  --app PATH            Existing app bundle or Contents/Resources/app to patch.
  --backup-dir PATH     Directory for the original Electron runtime backup.
  --codesign            Ad-hoc sign the explicitly selected app bundle.
  --restore             Restore the backup for --app and leave the app copy.
  --help                Show this message.

The patch is never applied implicitly by the plugin installer. On other
platforms the sidebar plugin remains usable with its iframe fallback, but
Electron webview-only DOM inspection and DevTools are unavailable.
`)
}

function requireValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

function parseArgs(argv) {
  const options = {
    input: undefined,
    output: undefined,
    app: undefined,
    backupDir: undefined,
    restore: false,
    codesign: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--restore') {
      options.restore = true
      continue
    }
    if (arg === '--codesign') {
      options.codesign = true
      continue
    }
    if (arg === '--input') {
      options.input = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--output') {
      options.output = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--app') {
      options.app = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--backup-dir') {
      options.backupDir = requireValue(argv, index, arg)
      index += 1
      continue
    }
    throw new Error(`unknown option: ${arg}`)
  }
  if (options.help) return options
  if (process.platform !== 'darwin') {
    throw new Error('the Electron desktop patch currently supports macOS only; install the plugin without --desktop-patch for iframe fallback')
  }
  if (options.input && !options.output) throw new Error('--input requires --output')
  if (options.output && !options.input && !options.restore) throw new Error('--output requires --input')
  if (options.input && options.app) throw new Error('use either --input/--output or --app, not both')
  if (options.restore && !options.app) throw new Error('--restore requires --app')
  if (!options.restore && !options.input && !options.app) throw new Error('choose --input/--output or --app')
  if (options.restore && options.codesign) throw new Error('--codesign cannot be combined with --restore')
  return options
}

function bundlePath(value) {
  const path = resolve(value)
  if (path.endsWith('.app')) return path
  const marker = `${pathSeparator()}Contents${pathSeparator()}Resources${pathSeparator()}app`
  if (path.endsWith(marker)) return path.slice(0, -marker.length)
  return undefined
}

function pathSeparator() {
  return process.platform === 'win32' ? '\\' : '/'
}

function appResourcesDir(value) {
  const path = resolve(value)
  return path.endsWith('.app') ? join(path, 'Contents', 'Resources', 'app') : path
}

function countOccurrences(source, needle) {
  let count = 0
  let offset = 0
  while (true) {
    const index = source.indexOf(needle, offset)
    if (index === -1) return count
    count += 1
    offset = index + needle.length
  }
}

function replaceExactly(source, needle, replacement, label) {
  const count = countOccurrences(source, needle)
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`)
  return source.replace(needle, replacement)
}

function runtimePath(appDir) {
  const libDir = join(appDir, 'lib')
  const matches = readdirSync(libDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && /^electron-runtime-.*\.js$/.test(entry.name))
    .map((entry) => entry.name)
  if (matches.length !== 1) throw new Error(`expected exactly one lib/electron-runtime-*.js, found ${matches.length} in ${libDir}`)
  return join(libDir, matches[0])
}

function assertMarkerState(source, fullyPatched) {
  const counts = Object.entries(MARKERS).map(([name, marker]) => [name, countOccurrences(source, marker)])
  const present = counts.filter(([, count]) => count > 0)
  if (fullyPatched) {
    const invalid = counts.filter(([, count]) => count !== 1)
    if (invalid.length > 0) throw new Error(`existing Desktop patch has invalid markers: ${invalid.map(([name, count]) => `${name}=${count}`).join(', ')}`)
    return
  }
  if (present.length > 0) throw new Error(`existing Desktop patch is incomplete: ${present.map(([name, count]) => `${name}=${count}`).join(', ')}`)
}

function backupKey(appDir) {
  return createHash('sha256').update(resolve(appDir)).digest('hex').slice(0, 16)
}

function backupPathFor(runtime, appDir, backupRoot) {
  return join(backupRoot, backupKey(appDir), basename(runtime))
}

function ensureBackup(runtime, appDir, backupRoot) {
  const backup = backupPathFor(runtime, appDir, backupRoot)
  mkdirSync(dirname(backup), {recursive: true})
  if (!existsSync(backup)) copyFileSync(runtime, backup)
  return backup
}

function prepareTarget(options) {
  if (!options.input) return {target: resolve(options.app), bundle: bundlePath(options.app)}
  const input = resolve(options.input)
  const output = resolve(options.output)
  if (!existsSync(input)) throw new Error(`input app does not exist: ${input}`)
  if (existsSync(output)) {
    console.log(`Output already exists; using it without overwriting: ${output}`)
  } else {
    mkdirSync(dirname(output), {recursive: true})
    cpSync(input, output, {recursive: true, force: false, errorOnExist: true})
    console.log(`Copied DSH Desktop.app to ${output}`)
  }
  return {target: appResourcesDir(output), bundle: output}
}

function install(options) {
  const {target, bundle} = prepareTarget(options)
  const runtime = runtimePath(target)
  const source = readFileSync(runtime, 'utf8')
  const fullyPatched = Object.values(MARKERS).every((marker) => countOccurrences(source, marker) === 1)
  assertMarkerState(source, fullyPatched)
  const backupRoot = resolve(options.backupDir || DEFAULT_BACKUP_ROOT)
  const backup = ensureBackup(runtime, target, backupRoot)
  if (!fullyPatched) {
    let patched = source
    patched = replaceExactly(patched, BASE_WINDOW_NEEDLE, BASE_WINDOW_REPLACEMENT, 'base BrowserWindow webPreferences')
    patched = replaceExactly(patched, CONTENT_VIEW_NEEDLE, CONTENT_VIEW_REPLACEMENT, 'content WebContentsView webPreferences')
    patched = replaceExactly(patched, HELPER_NEEDLE, HELPER_REPLACEMENT, 'webview URL helper')
    patched = replaceExactly(patched, RENDERER_NEEDLE, RENDERER_REPLACEMENT, 'renderer webview listeners')
    patched = replaceExactly(patched, CLEANUP_NEEDLE, CLEANUP_REPLACEMENT, 'renderer webview listener cleanup')
    assertMarkerState(patched, true)
    writeFileSync(runtime, patched, 'utf8')
    console.log(`Installed the DSH webview patch: ${runtime}`)
  } else {
    console.log(`The DSH webview patch is already installed: ${runtime}`)
  }
  console.log(`Original runtime backup: ${backup}`)
  if (options.codesign) {
    if (!bundle) throw new Error('--codesign requires an app bundle path ending in .app')
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', bundle], {stdio: 'inherit'})
    console.log(`Ad-hoc signed ${bundle}`)
  }
  console.log(`Use the copied app explicitly: ${bundle || target}`)
}

function restore(options) {
  const target = appResourcesDir(options.app)
  const runtime = runtimePath(target)
  const backupRoot = resolve(options.backupDir || DEFAULT_BACKUP_ROOT)
  const backup = backupPathFor(runtime, target, backupRoot)
  if (!existsSync(backup)) throw new Error(`no original runtime backup at ${backup}`)
  copyFileSync(backup, runtime)
  console.log(`Restored the original Electron runtime: ${runtime}`)
  console.log(`Backup retained at ${backup}`)
}

let options
try {
  options = parseArgs(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  usage()
  process.exitCode = 2
}
if (options?.help) usage()
else if (options) {
  try {
    if (options.restore) restore(options)
    else install(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
