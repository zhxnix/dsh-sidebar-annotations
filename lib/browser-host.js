import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * Host side of the web workbench browser bridge.
 *
 * The browser lives in the desktop renderer, while the model-facing tools run
 * in the DSH host.  This module deliberately keeps that crossing small: a
 * tool call becomes one queued action, the sidebar claims it with a GET, and
 * the sidebar sends the result back with a POST.  There is no shared browser
 * page or credential store in the host process.
 */

export const name = 'dsh-sidebar-annotations'
export const inject = ['tools', 'webServer']

export const BRIDGE_PATH = '/dsh-workbench/bridge'

/** The maximum time a model-facing action waits for its browser result. */
export const ACTION_TIMEOUT_MS = 20_000

/** The maximum time an idle browser poll is held open. */
export const POLL_TIMEOUT_MS = 20_000

/** Request and result limits keep a page from filling the host process. */
export const MAX_BODY_BYTES = 10 * 1024 * 1024
// Accessibility snapshots are text bounded, but screenshots are binary data
// represented as base64 in the bridge response.  Keep request bodies small
// while allowing one ordinary webview capture to cross the bridge.
export const MAX_RESULT_BYTES = 8 * 1024 * 1024

const MAX_SESSION_ID_LENGTH = 256
const MAX_ACTION_ID_LENGTH = 128
const MAX_URL_LENGTH = 8 * 1024
const MAX_SELECTOR_LENGTH = 8 * 1024
const MAX_TEXT_LENGTH = 64 * 1024
const MAX_SCRIPT_LENGTH = 64 * 1024
const MAX_ERROR_LENGTH = 4 * 1024
const MAX_KEY_LENGTH = 256
const MAX_ACTION_LENGTH = 256

// A sidebar normally sends another GET immediately after receiving an action.
// Retaining a short last-seen window also covers the interval in which it is
// executing an action and before it opens its next poll.
const FRONTEND_STALE_AFTER_MS = POLL_TIMEOUT_MS + 5_000

const OPERATIONS = Object.freeze([
  'open',
  'snapshot',
  'click',
  'fill',
  'evaluate',
  'console',
  'reload',
  'back',
  'forward',
  'close',
  'screenshot',
  'snapshot-and-screenshot',
  'click-index',
  'input-index',
  'type-text',
  'paste',
  'press-key',
  'select-text',
  'secondary-action',
  'drag',
  'scroll',
])

const OPERATION_ALIASES = Object.freeze({
  navigate: 'open',
  goto: 'open',
  getaxstate: 'snapshot',
  'ax-snapshot': 'snapshot',
  axsnapshot: 'snapshot',
  'get-ax-state': 'snapshot',
  getaxstateandscreenshot: 'snapshot-and-screenshot',
  'ax-snapshot-and-screenshot': 'snapshot-and-screenshot',
  axsnapshotandscreenshot: 'snapshot-and-screenshot',
  clickindex: 'click-index',
  'click-at-index': 'click-index',
  setvalue: 'input-index',
  'set-value': 'input-index',
  input: 'input-index',
  inputindex: 'input-index',
  type: 'type-text',
  typetext: 'type-text',
  'type-text-at-index': 'type-text',
  pasteindex: 'paste',
  press: 'press-key',
  presskey: 'press-key',
  'press-key-at-index': 'press-key',
  selecttext: 'select-text',
  'select-text-at-index': 'select-text',
  performsecondaryaction: 'secondary-action',
  'secondary-action-at-index': 'secondary-action',
  dragat: 'drag',
  'drag-at-index': 'drag',
  scrollat: 'scroll',
  'scroll-at-index': 'scroll',
  'get-state': 'state',
  probe: 'state',
  status: 'state',
})

class BodyTooLargeError extends Error {
  constructor() {
    super('request body is too large')
    this.name = 'BodyTooLargeError'
  }
}

class InvalidBodyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidBodyError'
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function header(request, key) {
  const headers = request?.headers
  if (!headers) return undefined
  const wanted = key.toLowerCase()
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

function boundedString(value, label, max, { required = false, allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label} is required`)
    return undefined
  }
  if (typeof value !== 'string') throw new Error(`${label} must be a string`)
  if (value.length > max) throw new Error(`${label} is too long (maximum ${max} characters)`)
  if (required && !allowEmpty && value.trim() === '') throw new Error(`${label} is required`)
  return value
}

function requiredSessionId(value) {
  const id = boundedString(value, 'sessionId', MAX_SESSION_ID_LENGTH, { required: true })
  return id.trim()
}

function requiredActionId(value) {
  const id = boundedString(value, 'actionId', MAX_ACTION_ID_LENGTH, { required: true })
  return id.trim()
}

function bytesOf(value) {
  return Buffer.byteLength(value, 'utf8')
}

function jsonText(value) {
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    throw new Error('browser result is not JSON-serializable')
  }
  // JSON.stringify(undefined) is undefined.  The bridge treats an omitted
  // result as null so the tool always resolves to a JSON value.
  return text === undefined ? 'null' : text
}

function writeJson(response, statusCode, value) {
  const text = jsonText(value)
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(bytesOf(text)),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
  response.writeHead(statusCode, headers)
  response.end(text)
}

function writeError(response, statusCode, message) {
  writeJson(response, statusCode, { ok: false, error: String(message) })
}

/**
 * Return a normalized authority from a Host header.  The bridge compares
 * authorities rather than blindly trusting an Origin string supplied by a
 * caller.
 */
function authorityOfHost(host) {
  if (typeof host !== 'string' || host.trim() === '') return undefined
  try {
    return new URL(`http://${host.trim()}`).host.toLowerCase()
  } catch {
    return undefined
  }
}

function authorityOfUrl(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
    return parsed.host.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * The route is only useful to the workbench page itself.  Require a Host and
 * at least one browser same-origin signal, and compare every signal supplied
 * by the browser.  In particular, an Origin of `null` is never accepted.
 */
export function isSameOriginRequest(request) {
  const expected = authorityOfHost(header(request, 'host'))
  if (expected === undefined) return false

  const fetchSite = header(request, 'sec-fetch-site')
  if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') return false

  const origin = header(request, 'origin')
  const referer = header(request, 'referer')
  const signals = [origin, referer].filter((value) => typeof value === 'string' && value !== '')
  if (signals.length === 0) return false

  for (const signal of signals) {
    if (signal === 'null') return false
    if (authorityOfUrl(signal) !== expected) return false
  }
  return true
}

function queryOf(request) {
  try {
    return new URL(request?.url ?? '/', 'http://dsh-workbench.invalid').searchParams
  } catch {
    return new URLSearchParams()
  }
}

function contentTypeOf(request) {
  const raw = header(request, 'content-type')
  if (typeof raw !== 'string') return ''
  return raw.split(';', 1)[0].trim().toLowerCase()
}

function contentLengthOf(request) {
  const raw = header(request, 'content-length')
  if (raw === undefined || raw.trim() === '') return undefined
  if (!/^\d+$/.test(raw.trim())) throw new InvalidBodyError('invalid content-length')
  const length = Number(raw.trim())
  if (!Number.isSafeInteger(length)) throw new BodyTooLargeError()
  return length
}

function addChunk(chunks, chunk, state) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
  state.size += buffer.byteLength
  if (state.size > MAX_BODY_BYTES) throw new BodyTooLargeError()
  chunks.push(buffer)
}

/** Read and cap a Node IncomingMessage without depending on a body package. */
async function readBody(request) {
  const length = contentLengthOf(request)
  if (length !== undefined && length > MAX_BODY_BYTES) throw new BodyTooLargeError()

  // Small request stubs used by embedders/tests may expose the body directly.
  if (typeof request?.body === 'string' || Buffer.isBuffer(request?.body)) {
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body)
    if (body.byteLength > MAX_BODY_BYTES) throw new BodyTooLargeError()
    return body.toString('utf8')
  }

  if (typeof request?.[Symbol.asyncIterator] === 'function') {
    const chunks = []
    const state = { size: 0 }
    try {
      for await (const chunk of request) addChunk(chunks, chunk, state)
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw error
      throw new InvalidBodyError(`unable to read request body: ${error instanceof Error ? error.message : String(error)}`)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  if (typeof request?.on !== 'function') return ''

  return await new Promise((resolve, reject) => {
    const chunks = []
    const state = { size: 0 }
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(value)
    }
    request.on('data', (chunk) => {
      if (settled) return
      try {
        addChunk(chunks, chunk, state)
      } catch (error) {
        request.resume?.()
        finish(error)
      }
    })
    request.on('end', () => finish(undefined, Buffer.concat(chunks).toString('utf8')))
    request.on('error', (error) => finish(new InvalidBodyError(`unable to read request body: ${error instanceof Error ? error.message : String(error)}`)))
    request.on('aborted', () => finish(new InvalidBodyError('request was aborted')))
  })
}

function parseJsonBody(text) {
  if (text.trim() === '') throw new InvalidBodyError('request body is required')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new InvalidBodyError('request body must be valid JSON')
  }
  if (!isRecord(value)) throw new InvalidBodyError('request body must be a JSON object')
  return value
}

function normalizedUrl(value) {
  const url = boundedString(value, 'url', MAX_URL_LENGTH, { required: true }).trim()
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('url must be a valid http:// or https:// URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('url must use http:// or https://')
  }
  // The host never receives or resolves credentials.  Embedded userinfo is
  // refused so a copied URL cannot accidentally turn into a credential flow.
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('url must not contain embedded credentials')
  }
  return parsed.href
}

function canonicalOperation(value) {
  const text = boundedString(value, 'operation', 64, { required: true }).trim().toLowerCase()
  const normalized = text.replace(/[ _]+/g, '-')
  return OPERATION_ALIASES[normalized] ?? normalized
}

function indexArg(args, label = 'index') {
  const value = args.index ?? args.ref
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error(`${label} must be an integer from 0 to 10000`)
  return value
}

function pointArgs(args) {
  const point = args.point ?? args.coordinates ?? args.position
  const x = Array.isArray(point) ? point[0] : point?.x ?? args.x
  const y = Array.isArray(point) ? point[1] : point?.y ?? args.y
  if (x === undefined && y === undefined) return undefined
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('point must contain finite numeric x and y coordinates')
  }
  return { x, y }
}

function normalizeOperation(args, operationOverride) {
  if (!isRecord(args)) throw new Error('sidebar_browser arguments must be an object')
  const raw = operationOverride ?? args.operation ?? args.action
  const operation = canonicalOperation(raw)
  if (!OPERATIONS.includes(operation)) {
    throw new Error(`unsupported sidebar_browser operation: ${operation}; expected ${OPERATIONS.join(', ')}`)
  }

  switch (operation) {
    case 'open':
      return { operation, args: { url: normalizedUrl(args.url) } }
    case 'click':
      return {
        operation,
        args: {
          selector: boundedString(args.selector, 'selector', MAX_SELECTOR_LENGTH, { required: true }).trim(),
          clickCount: args.clickCount === undefined ? 1 : boundedInteger(args.clickCount, 'clickCount', 1, 3),
          mouseButton: args.mouseButton === undefined ? 'left' : boundedString(args.mouseButton, 'mouseButton', 16, { required: true }).trim().toLowerCase(),
        },
      }
    case 'fill':
      return {
        operation,
        args: {
          selector: boundedString(args.selector, 'selector', MAX_SELECTOR_LENGTH, { required: true }).trim(),
          text: boundedString(args.text, 'text', MAX_TEXT_LENGTH, { required: true, allowEmpty: true }),
        },
      }
    case 'evaluate': {
      const script = args.script ?? args.expression
      return { operation, args: { script: boundedString(script, 'script', MAX_SCRIPT_LENGTH, { required: true }) } }
    }
    case 'console': {
      const actionArgs = {}
      if (args.level !== undefined) actionArgs.level = boundedString(args.level, 'level', 32, { required: true }).trim()
      if (args.limit !== undefined) {
        if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) throw new Error('limit must be an integer from 1 to 200')
        actionArgs.limit = args.limit
      }
      if (args.clear !== undefined) {
        if (typeof args.clear !== 'boolean') throw new Error('clear must be a boolean')
        actionArgs.clear = args.clear
      }
      return { operation, args: actionArgs }
    }
    case 'snapshot':
      return { operation, args: { maxNodes: args.maxNodes === undefined ? undefined : boundedInteger(args.maxNodes, 'maxNodes', 1, 500) } }
    case 'reload':
    case 'back':
    case 'forward':
    case 'close':
      return { operation, args: {} }
    case 'screenshot':
      return {
        operation,
        args: {
          fullPage: args.fullPage === true,
        },
      }
    case 'snapshot-and-screenshot':
      return {
        operation,
        args: {
          fullPage: args.fullPage === true,
          maxNodes: args.maxNodes === undefined ? undefined : boundedInteger(args.maxNodes, 'maxNodes', 1, 500),
        },
      }
    case 'click-index':
      return {
        operation,
        args: {
          index: args.index === undefined && args.ref === undefined ? undefined : indexArg(args),
          point: pointArgs(args),
          clickCount: args.clickCount === undefined ? 1 : boundedInteger(args.clickCount, 'clickCount', 1, 3),
          mouseButton: args.mouseButton === undefined ? 'left' : boundedString(args.mouseButton, 'mouseButton', 16, { required: true }).trim().toLowerCase(),
        },
      }
    case 'input-index':
    case 'type-text':
    case 'paste': {
      const text = args.text ?? args.value
      return {
        operation,
        args: {
          index: args.index === undefined && args.ref === undefined ? undefined : indexArg(args),
          text: boundedString(text, 'text', MAX_TEXT_LENGTH, { required: true, allowEmpty: true }),
        },
      }
    }
    case 'press-key': {
      const key = args.key ?? args.keys
      const modifiers = args.modifiers
      if (modifiers !== undefined && (!Array.isArray(modifiers) || modifiers.some(value => typeof value !== 'string' || value.length > 32))) {
        throw new Error('modifiers must be an array of short strings')
      }
      return {
        operation,
        args: {
          index: args.index === undefined && args.ref === undefined ? undefined : indexArg(args),
          key: boundedString(key, 'key', MAX_KEY_LENGTH, { required: true }),
          modifiers: modifiers?.map(value => value.trim()),
        },
      }
    }
    case 'select-text':
      return {
        operation,
        args: {
          index: indexArg(args),
          text: args.text === undefined ? undefined : boundedString(args.text, 'text', MAX_TEXT_LENGTH, { allowEmpty: true }),
          selectionType: args.selectionType === undefined ? 'text' : boundedString(args.selectionType, 'selectionType', 32, { required: true }).trim(),
        },
      }
    case 'secondary-action':
      return {
        operation,
        args: {
          index: indexArg(args),
          action: boundedString(args.action ?? args.actionName, 'action', MAX_ACTION_LENGTH, { required: true }).trim(),
        },
      }
    case 'drag':
      return {
        operation,
        args: {
          index: args.index === undefined && args.ref === undefined ? undefined : indexArg(args),
          from: pointArgs({ point: args.from ?? args.start }),
          to: pointArgs({ point: args.to ?? args.end }),
          duration: args.duration === undefined ? 0 : boundedInteger(args.duration, 'duration', 0, 10_000),
        },
      }
    case 'scroll':
      return {
        operation,
        args: {
          index: args.index === undefined && args.ref === undefined ? undefined : indexArg(args),
          point: pointArgs(args),
          direction: boundedString(args.direction ?? 'down', 'direction', 16, { required: true }).trim().toLowerCase(),
          amount: args.amount === undefined ? 1 : boundedInteger(args.amount, 'amount', 1, 20),
        },
      }
    default:
      // The enum check above is exhaustive, but keep a defensive branch for
      // callers that bypass the tool schema.
      throw new Error(`unsupported sidebar_browser operation: ${operation}`)
  }
}

function boundedInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function signalOf(exec) {
  return exec?.signal
}

function sessionIdOf(exec) {
  const id = exec?.agent?.session?.id
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('sidebar_browser requires an initiating agent session')
  }
  if (id.length > MAX_SESSION_ID_LENGTH) throw new Error('agent session id is too long')
  return id
}

function sessionStateFor(sessions, sessionId) {
  let state = sessions.get(sessionId)
  if (state !== undefined) return state
  state = {
    queue: [],
    pendingActions: new Map(),
    getWaiters: new Set(),
    lastSeenAt: 0,
  }
  sessions.set(sessionId, state)
  return state
}

function hasFrontend(state) {
  return state.getWaiters.size > 0 || (state.lastSeenAt > 0 && Date.now() - state.lastSeenAt <= FRONTEND_STALE_AFTER_MS)
}

function removeQueuedAction(state, actionId) {
  if (state.queue.length === 0) return
  state.queue = state.queue.filter((action) => action.actionId !== actionId)
}

function takeQueuedAction(state) {
  while (state.queue.length > 0) {
    const action = state.queue.shift()
    if (state.pendingActions.has(action.actionId)) return action
  }
  return null
}

function makeGetWaiter(state, request) {
  let timer
  let settled = false
  let abortHandler
  let resolvePromise

  const promise = new Promise((resolve) => {
    resolvePromise = resolve
  })

  const finish = (value) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    state.getWaiters.delete(waiter)
    if (abortHandler && typeof request?.removeListener === 'function') request.removeListener('aborted', abortHandler)
    resolvePromise(value)
  }

  const waiter = {
    deliver(action) {
      finish({ action })
    },
    cancel() {
      finish({ cancelled: true })
    },
  }
  timer = setTimeout(() => finish({ action: null }), POLL_TIMEOUT_MS)
  state.getWaiters.add(waiter)
  if (typeof request?.on === 'function') {
    abortHandler = () => waiter.cancel()
    request.on('aborted', abortHandler)
  }
  return promise
}

function deliverAction(state, action) {
  const waiter = state.getWaiters.values().next().value
  if (waiter !== undefined) {
    waiter.deliver(action)
    return true
  }
  state.queue.push(action)
  return false
}

function actionWait(state, operation, actionArgs, signal, panelKind) {
  return new Promise((resolve, reject) => {
    const action = {
      actionId: randomUUID(),
      operation,
      args: actionArgs,
    }
    if (panelKind !== undefined) action.panelKind = panelKind
    const pending = {
      action,
      timer: undefined,
      abortHandler: undefined,
      settled: false,
      finish: undefined,
      resolve,
      reject,
    }

    const finish = (error, value) => {
      if (pending.settled) return
      pending.settled = true
      clearTimeout(pending.timer)
      state.pendingActions.delete(action.actionId)
      removeQueuedAction(state, action.actionId)
      if (pending.abortHandler && typeof signal?.removeEventListener === 'function') {
        signal.removeEventListener('abort', pending.abortHandler)
      }
      if (error) reject(error)
      else resolve(value)
    }
    pending.finish = finish

    pending.timer = setTimeout(() => {
      finish(new Error(`Timed out waiting ${ACTION_TIMEOUT_MS}ms for the sidebar browser. Make sure the workbench sidebar is open and connected.`))
    }, ACTION_TIMEOUT_MS)
    pending.abortHandler = () => finish(new Error('sidebar_browser action was aborted'))
    if (signal?.aborted) {
      finish(new Error('sidebar_browser action was aborted'))
      return
    }
    if (typeof signal?.addEventListener === 'function') signal.addEventListener('abort', pending.abortHandler, { once: true })

    state.pendingActions.set(action.actionId, pending)
    deliverAction(state, action)
  })
}

function renderResult(_args, value) {
  let text
  try {
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  return [{ type: 'text', text: text === undefined ? 'null' : text }]
}

function outputSchema() {
  // evaluate() may legitimately return any JSON value.  The DSH schema DSL's
  // explicit json node is the contract for that case; snapshot/console can
  // therefore return their natural object or array values as well.
  return { type: 'json' }
}

function browserTool(sessions) {
  return defineTool({
    name: 'sidebar_browser',
    description:
      'Control and inspect the HTTP(S) page currently previewed in the calling conversation\'s DSH sidebar. '
      + 'Use operation=open with a URL, snapshot to read the page, click or fill for interaction, evaluate to run a bounded page script, '
      + 'console to read captured console messages, reload/back/forward for navigation, screenshot for a visible capture, '
      + 'and click-index/input-index/press-key for accessibility-indexed interaction. '
      + 'The action runs in the calling session\'s sidebar; keep the sidebar open while the action is in progress.',
    parameters: {
      operation: { type: 'string', required: true, enum: OPERATIONS, description: 'Browser operation; navigation, AX snapshot, screenshot, selector or accessibility-indexed interaction.' },
      // `action` and `expression` are compatibility aliases for older clients;
      // the documented model-facing spelling is operation and script.
      action: { type: 'string', enum: OPERATIONS, description: 'Compatibility alias for operation.' },
      url: { type: 'string', description: 'HTTP(S) URL for operation=open.' },
      selector: { type: 'string', description: 'CSS selector for click/fill.' },
      text: { type: 'string', description: 'Text for operation=fill; an empty string is allowed.' },
      script: { type: 'string', description: 'JavaScript for operation=evaluate, capped at 64 KiB.' },
      expression: { type: 'string', description: 'Compatibility alias for script.' },
      level: { type: 'string', description: 'Optional console severity filter.' },
      limit: { type: 'integer', description: 'Optional console record limit from 1 to 200.' },
      clear: { type: 'boolean', description: 'Clear captured console records after reading.' },
      index: { type: 'integer', description: 'Accessibility index from the latest snapshot.' },
      ref: { type: 'integer', description: 'Compatibility alias for index.' },
      point: { type: 'json', description: 'Optional [x,y] or {x,y} viewport point.' },
      coordinates: { type: 'json', description: 'Compatibility alias for point.' },
      x: { type: 'number', description: 'Viewport x coordinate.' },
      y: { type: 'number', description: 'Viewport y coordinate.' },
      key: { type: 'string', description: 'Key or key combination for press-key.' },
      modifiers: { type: 'json', description: 'Optional modifier key names.' },
      actionName: { type: 'string', description: 'Accessibility action name for secondary-action.' },
      selectionType: { type: 'string', description: 'Selection mode for select-text.' },
      fullPage: { type: 'boolean', description: 'Capture the full page when supported by the embedded webview.' },
      maxNodes: { type: 'integer', description: 'Maximum AX nodes in a snapshot.' },
      clickCount: { type: 'integer', description: 'Number of clicks for click-index or point interaction.' },
      mouseButton: { type: 'string', description: 'Mouse button for click-index or point interaction.' },
    },
    output: {
      schema: outputSchema(),
      render: renderResult,
    },
    timeoutMs: ACTION_TIMEOUT_MS,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      signalOf(exec)?.throwIfAborted?.()
      const sessionId = sessionIdOf(exec)
      const normalized = normalizeOperation(args)
      const state = sessionStateFor(sessions, sessionId)
      if (!hasFrontend(state)) {
        throw new Error('No sidebar browser frontend is connected for this session. Open the DSH workbench sidebar first.')
      }
      return await actionWait(state, normalized.operation, normalized.args, signalOf(exec))
    },
  })
}

/**
 * Service consumed by dsh-cua's runtime parent.  It deliberately shares the
 * exact queue and pending-action map used by sidebar_browser so both APIs
 * always target the visible webview belonging to the same DSH session.
 */
function workbenchBrowserService(sessions) {
  return Object.freeze({
    request(sessionId, operation, args = {}, signal) {
      const id = requiredSessionId(sessionId)
      if (canonicalOperation(operation) === 'state') {
        const state = sessionStateFor(sessions, id)
        return Promise.resolve({connected: hasFrontend(state), panelKind: 'dsh-sidebar-annotations'})
      }
      const normalized = normalizeOperation(args, operation)
      const state = sessionStateFor(sessions, id)
      if (!hasFrontend(state)) {
        throw new Error('No sidebar browser frontend is connected for this session. Open the DSH workbench sidebar first.')
      }
      return actionWait(state, normalized.operation, normalized.args, signal, 'dsh-sidebar-annotations')
    },
  })
}

async function handleGet(request, response, sessions) {
  const sessionId = queryOf(request).get('sessionId')
  let id
  try {
    id = requiredSessionId(sessionId)
  } catch (error) {
    writeError(response, 400, error.message)
    return
  }

  const state = sessionStateFor(sessions, id)
  state.lastSeenAt = Date.now()
  const queued = takeQueuedAction(state)
  if (queued !== null) {
    const pending = state.pendingActions.get(queued.actionId)
    if (pending !== undefined) pending.delivered = true
    writeJson(response, 200, { ok: true, action: queued })
    return
  }

  const waited = await makeGetWaiter(state, request)
  if (waited.cancelled) return
  if (waited.action !== null) {
    const pending = state.pendingActions.get(waited.action.actionId)
    if (pending !== undefined) pending.delivered = true
  }
  writeJson(response, 200, { ok: true, action: waited.action })
}

async function handlePost(request, response, sessions) {
  if (contentTypeOf(request) !== 'application/json') {
    writeError(response, 415, 'POST requests must use Content-Type: application/json')
    return
  }

  let body
  try {
    body = parseJsonBody(await readBody(request))
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      writeError(response, 413, error.message)
    } else {
      writeError(response, 400, error instanceof Error ? error.message : String(error))
    }
    return
  }

  let sessionId
  let actionId
  try {
    sessionId = requiredSessionId(body.sessionId)
    actionId = requiredActionId(body.actionId)
  } catch (error) {
    writeError(response, 400, error.message)
    return
  }
  if (typeof body.ok !== 'boolean') {
    writeError(response, 400, 'ok must be a boolean')
    return
  }

  let result = null
  if (body.ok) {
    result = body.result === undefined ? null : body.result
    let resultJson
    try {
      resultJson = jsonText(result)
    } catch (error) {
      writeError(response, 400, error.message)
      return
    }
    if (bytesOf(resultJson) > MAX_RESULT_BYTES) {
      writeError(response, 413, 'browser result is too large')
      return
    }
  } else {
    try {
      const message = boundedString(body.error, 'error', MAX_ERROR_LENGTH, { required: true })
      body.error = message
    } catch (error) {
      writeError(response, 400, error.message)
      return
    }
  }

  const state = sessions.get(sessionId)
  const pending = state?.pendingActions.get(actionId)
  if (pending === undefined) {
    writeError(response, 404, 'unknown or expired sidebar browser action')
    return
  }

  if (body.ok) {
    pending.finish(undefined, result)
    writeJson(response, 200, { ok: true, sessionId, actionId, result })
  } else {
    pending.finish(new Error(`Sidebar browser action failed: ${body.error}`))
    writeJson(response, 200, { ok: true, sessionId, actionId, accepted: false, error: body.error })
  }
}

function registerLifetime(ctx, setup, label) {
  if (typeof ctx?.effect === 'function') return ctx.effect(setup, label)
  return setup()
}

/**
 * Install the bridge route and the model-facing sidebar_browser tool.
 *
 * The state map is intentionally created per plugin instance.  It is never
 * global across profiles, and every queue/pending action is keyed by the
 * calling agent's session id.
 */
export function apply(ctx) {
  const sessions = new Map()
  const tool = browserTool(sessions)
  const workbenchBrowser = workbenchBrowserService(sessions)
  const unprovide = typeof ctx.provide === 'function' ? ctx.provide('workbenchBrowser', workbenchBrowser) : undefined
  const unregisterTool = ctx.tools.register(tool)

  registerLifetime(ctx, () => {
    const unregisterRoute = ctx.webServer.register({
      kind: 'exact',
      path: BRIDGE_PATH,
      handler: async (request, response) => {
        if (!isSameOriginRequest(request)) {
          writeError(response, 403, 'same-origin request required')
          return
        }
        if (request.method === 'GET') {
          await handleGet(request, response, sessions)
          return
        }
        if (request.method === 'POST') {
          await handlePost(request, response, sessions)
          return
        }
        response.writeHead(405, { allow: 'GET, POST', 'cache-control': 'no-store' })
        response.end()
      },
    })

    return () => {
      if (typeof unregisterRoute === 'function') unregisterRoute()
      for (const state of sessions.values()) {
        for (const pending of state.pendingActions.values()) {
          pending.finish(new Error('sidebar browser bridge was unloaded'))
        }
        for (const waiter of state.getWaiters) waiter.cancel()
      }
      sessions.clear()
      if (typeof unregisterTool === 'function') unregisterTool()
      if (typeof unprovide === 'function') unprovide()
    }
  }, 'dsh-sidebar-annotations: browser bridge')
}
