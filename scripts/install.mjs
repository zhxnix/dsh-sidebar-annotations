#!/usr/bin/env node

/**
 * Install the local checkout into a DSH profile.
 *
 * For profiles managed by the DSH CLI, the published package can be added
 * with the official command:
 *
 *   dsh plugin --profile web add dsh-sidebar-annotations
 *
 * This script is intentionally a small, reversible fallback for a GitHub
 * checkout or a development build. It only creates a symlink owned by this
 * plugin and appends a marked loader entry. It never replaces a different
 * plugin, rewrites a profile file, patches a desktop application, or touches
 * an unrelated mini-program plugin.
 */

import {execFileSync} from 'node:child_process'
import {lstat, mkdir, readFile, realpath, symlink, unlink, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const PLUGIN_ID = 'dsh-sidebar-annotations'
const PROFILE_MARKER_START = `# ${PLUGIN_ID}:start`
const PROFILE_MARKER_END = `# ${PLUGIN_ID}:end`
const PROFILE_BLOCK = [
  PROFILE_MARKER_START,
  '- insert:',
  `    - id: ${PLUGIN_ID}`,
  `      name: './plugins/${PLUGIN_ID}/lib/index.js'`,
  PROFILE_MARKER_END,
].join('\n')

function usage() {
  console.log(`Usage:
  node scripts/install.mjs [--profile PATH]
  node scripts/install.mjs --uninstall [--profile PATH]

Options:
  --profile PATH             DSH profile directory. A bare name such as
                             "desktop" resolves under ~/.dsh/profiles/.
  --uninstall                Remove this checkout link and its marked loader.
  --desktop-patch            Also run the explicit macOS desktop patch. This
                             never runs unless this flag is present.
  --desktop-input PATH       Source DSH Desktop.app for --desktop-patch.
  --desktop-output PATH      New app copy for --desktop-patch.
  --desktop-app PATH         Existing app or app Resources/app directory to
                             patch in place.
  --desktop-backup-dir PATH  Where the reversible Electron backup is stored.
  --codesign                 Ad-hoc sign the copied app after patching.
  --help                     Show this message.

Environment:
  DSH_PROFILE_DIR             Same as --profile when the option is omitted.
`)
}

function requireValue(argv, index, option) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

function parseArgs(argv) {
  const options = {
    profile: process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh', 'profiles', 'desktop'),
    uninstall: false,
    desktopPatch: false,
    desktopInput: undefined,
    desktopOutput: undefined,
    desktopApp: undefined,
    desktopBackupDir: undefined,
    codesign: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--uninstall') {
      options.uninstall = true
      continue
    }
    if (arg === '--desktop-patch') {
      options.desktopPatch = true
      continue
    }
    if (arg === '--codesign') {
      options.codesign = true
      continue
    }
    if (arg === '--profile') {
      options.profile = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--desktop-input') {
      options.desktopInput = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--desktop-output') {
      options.desktopOutput = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--desktop-app') {
      options.desktopApp = requireValue(argv, index, arg)
      index += 1
      continue
    }
    if (arg === '--desktop-backup-dir') {
      options.desktopBackupDir = requireValue(argv, index, arg)
      index += 1
      continue
    }
    throw new Error(`unknown option: ${arg}`)
  }
  if (options.desktopInput || options.desktopOutput || options.desktopApp || options.desktopBackupDir || options.codesign) {
    if (!options.desktopPatch) throw new Error('desktop options require --desktop-patch')
  }
  if (options.desktopPatch && options.desktopInput && options.desktopApp) {
    throw new Error('use either --desktop-input/--desktop-output or --desktop-app, not both')
  }
  if (options.desktopPatch && options.desktopInput && !options.desktopOutput) {
    throw new Error('--desktop-input requires --desktop-output')
  }
  if (options.desktopPatch && options.desktopOutput && !options.desktopInput) {
    throw new Error('--desktop-output requires --desktop-input')
  }
  if (options.desktopPatch && !options.desktopInput && !options.desktopApp) {
    throw new Error('--desktop-patch requires --desktop-input/--desktop-output or --desktop-app')
  }
  return options
}

function profilePath(value) {
  if (value === 'desktop' || value === 'web' || value === 'headless') {
    return resolve(join(homedir(), '.dsh', 'profiles', value))
  }
  return resolve(value)
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function readPatch(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return ''
    throw error
  }
}

function hasLoaderEntry(patch) {
  return patch.includes(PROFILE_MARKER_START)
    || new RegExp(`^\\s*-\\s*id:\\s*${PLUGIN_ID}\\s*$`, 'm').test(patch)
}

function withTrailingNewline(text) {
  return text.length === 0 || text.endsWith('\n') ? text : `${text}\n`
}

async function installProfile(profile) {
  const pluginsDir = join(profile, 'plugins')
  const link = join(pluginsDir, PLUGIN_ID)
  const patchPath = join(profile, 'cordis.patch.yml')

  await mkdir(pluginsDir, {recursive: true})
  if (await exists(link)) {
    const current = await realpath(link).catch(() => '')
    if (current !== resolve(root)) {
      throw new Error(`refusing to replace existing ${link}; it belongs to ${current || 'another file'}`)
    }
  } else {
    await symlink(resolve(root), link)
    console.log(`Linked ${PLUGIN_ID} into ${profile}`)
  }

  const patch = await readPatch(patchPath)
  if (hasLoaderEntry(patch)) {
    console.log(`Profile already loads ${PLUGIN_ID}: ${patchPath}`)
  } else {
    const next = `${withTrailingNewline(patch)}${PROFILE_BLOCK}\n`
    await writeFile(patchPath, next, 'utf8')
    console.log(`Added a marked loader entry to ${patchPath}`)
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
}

function withoutOwnLoader(patch) {
  const exact = new RegExp(`(?:^|\\n)${escapeRegExp(PROFILE_BLOCK)}(?:\\n|$)`)
  return patch.replace(exact, (match, offset) => offset === 0 ? '' : '\n')
}

async function uninstallProfile(profile) {
  const link = join(profile, 'plugins', PLUGIN_ID)
  if (await exists(link)) {
    const current = await realpath(link).catch(() => '')
    if (current !== resolve(root)) {
      throw new Error(`refusing to remove ${link}; it does not point to this checkout`)
    }
    await unlink(link)
    console.log(`Removed the ${PLUGIN_ID} checkout link from ${profile}`)
  } else {
    console.log(`No ${PLUGIN_ID} checkout link found in ${profile}`)
  }

  const patchPath = join(profile, 'cordis.patch.yml')
  const patch = await readPatch(patchPath)
  const next = withoutOwnLoader(patch)
  if (next !== patch) {
    await writeFile(patchPath, next, 'utf8')
    console.log(`Removed this plugin's marked loader entry from ${patchPath}`)
  } else {
    console.log(`No marked ${PLUGIN_ID} loader entry found in ${patchPath}`)
  }
}

function runDesktopPatch(options) {
  const script = join(root, 'scripts', 'patch-desktop.mjs')
  const args = []
  if (options.desktopInput) args.push('--input', resolve(options.desktopInput), '--output', resolve(options.desktopOutput))
  else if (options.desktopApp) args.push('--app', resolve(options.desktopApp))
  if (options.desktopBackupDir) args.push('--backup-dir', resolve(options.desktopBackupDir))
  if (options.codesign) args.push('--codesign')
  execFileSync(process.execPath, [script, ...args], {stdio: 'inherit'})
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return
  }

  const profile = profilePath(options.profile)
  if (options.uninstall) await uninstallProfile(profile)
  else {
    execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], {stdio: 'inherit'})
    execFileSync(process.execPath, ['--check', join(root, 'lib', 'client.js')], {stdio: 'inherit'})
    await installProfile(profile)
  }

  if (options.desktopPatch) runDesktopPatch(options)
  console.log(options.uninstall
    ? 'Removed the local plugin files. Restart DSH to unload the plugin.'
    : 'Installed the local plugin. Restart DSH and create a new session to load it.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
