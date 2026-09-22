const UI_ATTRIBUTE = 'data-dsh-annotation-ui';
const UI_Z_INDEX = '2147483646';
const STYLE_ATTRIBUTE = 'data-dsh-context-selection-style';
const BUTTON_CLASS = 'dsh-context-selection-button';
const POPOVER_CLASS = 'dsh-context-selection-popover';
const MARGIN = 8;

const STYLE_TEXT = `
  .${BUTTON_CLASS}[hidden], .${POPOVER_CLASS}[hidden] { display: none !important; }
  .${BUTTON_CLASS} {
    position: fixed;
    z-index: ${UI_Z_INDEX};
    box-sizing: border-box;
    min-height: 30px;
    padding: 0 12px;
    border: 1px solid var(--dsw-alias-border-l2, #d7d7df);
    border-radius: 8px;
    background: var(--dsw-alias-bg-layer-2, #ffffff);
    color: var(--dsw-alias-label-primary, #24242a);
    box-shadow: 0 7px 24px rgb(0 0 0 / 18%);
    cursor: pointer;
    font: 600 12px/28px var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    white-space: nowrap;
    user-select: none;
  }
  .${BUTTON_CLASS}:hover {
    border-color: var(--dsw-alias-state-business-primary, #2f6fed);
    background: var(--dsw-alias-interactive-bg-hover-solid, #f1f5ff);
  }
  .${BUTTON_CLASS}:focus-visible,
  .${POPOVER_CLASS} textarea:focus-visible,
  .${POPOVER_CLASS} button:focus-visible {
    outline: 2px solid var(--dsw-alias-state-business-primary, #2f6fed);
    outline-offset: 2px;
  }
  .${POPOVER_CLASS} {
    position: fixed;
    z-index: ${UI_Z_INDEX};
    display: flex;
    box-sizing: border-box;
    width: min(320px, calc(100vw - 16px));
    max-height: min(260px, calc(100vh - 16px));
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    overflow: auto;
    border: 1px solid var(--dsw-alias-border-l2, #d7d7df);
    border-radius: 10px;
    background: var(--dsw-alias-bg-layer-2, #ffffff);
    color: var(--dsw-alias-label-primary, #24242a);
    box-shadow: 0 12px 36px rgb(0 0 0 / 22%);
    font: 13px/18px var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-title] {
    color: var(--dsw-alias-label-secondary, #5f6068);
    font-weight: 600;
  }
  .${POPOVER_CLASS} textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 58px;
    max-height: 132px;
    padding: 8px 9px;
    resize: vertical;
    border: 1px solid var(--dsw-alias-border-l1, #dedee5);
    border-radius: 7px;
    background: var(--dsw-alias-bg-layer-1, #f7f7f9);
    color: var(--dsw-alias-label-primary, #24242a);
    font: 13px/19px var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  }
  .${POPOVER_CLASS} textarea:focus {
    border-color: var(--dsw-alias-state-business-primary, #2f6fed);
    outline: none;
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-hint] {
    color: var(--dsw-alias-label-tertiary, #85858e);
    font-size: 11px;
    line-height: 16px;
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-actions] {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-actions] button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--dsw-alias-label-secondary, #5f6068);
    cursor: pointer;
    font: 600 12px/28px var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-actions] button:hover {
    background: var(--dsw-alias-interactive-bg-hover, rgb(0 0 0 / 6%));
    color: var(--dsw-alias-label-primary, #24242a);
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-save] {
    background: var(--dsw-alias-state-business-primary, #2f6fed) !important;
    color: #ffffff !important;
  }
  .${POPOVER_CLASS} [data-dsh-context-selection-save]:hover {
    filter: brightness(1.08);
  }
  @media (prefers-color-scheme: dark) {
    .${BUTTON_CLASS},
    .${POPOVER_CLASS} {
      border-color: var(--dsw-alias-border-l2, #3d3d44);
      background: var(--dsw-alias-bg-layer-2, #26262b);
      color: var(--dsw-alias-label-primary, #ececf0);
      box-shadow: 0 10px 34px rgb(0 0 0 / 55%);
    }
    .${BUTTON_CLASS}:hover {
      background: var(--dsw-alias-interactive-bg-hover-solid, #303038);
    }
    .${POPOVER_CLASS} textarea {
      border-color: var(--dsw-alias-border-l1, #37373e);
      background: var(--dsw-alias-bg-layer-1, #1d1d21);
      color: var(--dsw-alias-label-primary, #ececf0);
    }
    .${POPOVER_CLASS} [data-dsh-context-selection-actions] button:hover {
      background: var(--dsw-alias-interactive-bg-hover, rgb(255 255 255 / 8%));
    }
  }
`;

function asElement(node) {
  if (!node) return null;
  if (node.nodeType === 1) return node;
  return node.parentElement || null;
}

function closestElement(node, selector) {
  let element = asElement(node);
  while (element) {
    if (typeof element.matches === 'function' && element.matches(selector)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function isEditableNode(node) {
  let element = asElement(node);
  while (element) {
    if (
      element.hasAttribute &&
      (element.hasAttribute(UI_ATTRIBUTE) || element.hasAttribute('data-dsh-workbench'))
    ) {
      return true;
    }
    const tag = String(element.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (element.isContentEditable) return true;
    element = element.parentElement;
  }
  return false;
}

function escapeCss(value) {
  const text = String(value == null ? '' : value);
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(text);
  }

  let escaped = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const code = text.charCodeAt(index);
    if (code === 0) {
      escaped += '\ufffd';
    } else if (
      code < 32 ||
      code === 127 ||
      (index === 0 && code >= 48 && code <= 57) ||
      (index === 1 && code >= 48 && code <= 57 && text.charAt(0) === '-')
    ) {
      escaped += `\\${code.toString(16)} `;
    } else if (index === 0 && character === '-' && text.length === 1) {
      escaped += '\\-';
    } else if (/[A-Za-z0-9_-]/.test(character) || code >= 128) {
      escaped += character;
    } else {
      escaped += `\\${character}`;
    }
  }
  return escaped;
}

function selectorForElement(element) {
  if (!element || element.nodeType !== 1 || isEditableNode(element)) return '';
  const parts = [];
  let current = element;
  let depth = 0;

  while (current && current.nodeType === 1 && depth < 7) {
    const tag = String(current.localName || current.tagName || '*').toLowerCase();
    let part = tag || '*';
    const id = current.id || '';
    if (id) {
      part += `#${escapeCss(id)}`;
      parts.unshift(part);
      break;
    }

    const testId = current.getAttribute && (
      current.getAttribute('data-testid') || current.getAttribute('data-test-id')
    );
    if (testId) part += `[data-testid="${escapeCss(testId)}"]`;

    if (!testId && current.classList && current.classList.length) {
      let classCount = 0;
      for (const className of current.classList) {
        if (className) {
          part += `.${escapeCss(className)}`;
          classCount += 1;
        }
        if (classCount >= 2) break;
      }
    }

    let typeIndex = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (String(sibling.localName || sibling.tagName || '').toLowerCase() === tag) {
        typeIndex += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    part += `:nth-of-type(${typeIndex})`;
    parts.unshift(part);
    current = current.parentElement;
    depth += 1;
  }

  return parts.join(' > ');
}

function selectionElement(node) {
  return asElement(node);
}

function selectionIsUsable(selection, documentObject) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startElement = selectionElement(range.startContainer);
  const endElement = selectionElement(range.endContainer);
  const commonElement = selectionElement(range.commonAncestorContainer);
  if (
    !startElement ||
    !endElement ||
    isEditableNode(startElement) ||
    isEditableNode(endElement) ||
    isEditableNode(commonElement)
  ) {
    return null;
  }

  const rawText = range.toString().replace(/\r\n?/g, '\n');
  const text = rawText
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\n+|\n+$/g, '');
  if (!text.trim()) return null;

  // A selection can begin outside a control and end inside one. Keep the
  // selection usable only when both ends and its shared ancestor are content.
  // This also keeps the workbench and annotation popover out of captured data.
  if (
    closestElement(startElement, `[${UI_ATTRIBUTE}], [data-dsh-workbench]`) ||
    closestElement(endElement, `[${UI_ATTRIBUTE}], [data-dsh-workbench]`)
  ) {
    return null;
  }

  let rangeClone;
  try {
    rangeClone = range.cloneRange();
  } catch (error) {
    return null;
  }

  return {
    range: rangeClone,
    text,
    selector: selectorForElement(startElement),
    document: documentObject
  };
}

function rangeRect(range) {
  if (!range) return null;
  let rect = null;
  try {
    rect = range.getBoundingClientRect();
  } catch (error) {
    rect = null;
  }
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
    if (rect.width || rect.height) return rect;
  }

  try {
    const rects = Array.from(range.getClientRects ? range.getClientRects() : []);
    for (const item of rects) {
      if (item && Number.isFinite(item.left) && Number.isFinite(item.top) && (item.width || item.height)) {
        return item;
      }
    }
  } catch (error) {
    // The range may have been detached while the page was re-rendering.
  }
  return rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) ? rect : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function addAttribute(element) {
  element.setAttribute(UI_ATTRIBUTE, 'true');
  return element;
}

function appendStyle(documentObject) {
  const existing = documentObject.querySelector(`style[${STYLE_ATTRIBUTE}]`);
  if (existing) return { element: existing, created: false };
  const style = documentObject.createElement('style');
  style.setAttribute(STYLE_ATTRIBUTE, 'true');
  style.textContent = STYLE_TEXT;
  (documentObject.head || documentObject.documentElement || documentObject.body).appendChild(style);
  return { element: style, created: true };
}

export function installContextSelection(options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function cleanupUnavailableContextSelection() {};
  }

  const {
    getSessionId,
    onAnnotate
  } = options || {};

  if (
    typeof window.__dshContextSelectionCleanup === 'function'
  ) {
    window.__dshContextSelectionCleanup();
  }

  const documentObject = document;
  const windowObject = window;
  const style = appendStyle(documentObject);
  const mount = documentObject.body || documentObject.documentElement;
  if (!mount) return function cleanupWithoutDocumentRoot() {};

  let active = true;
  let selectionData = null;
  let popoverOpen = false;
  let selectionFrame = 0;
  let selectionFrameType = '';
  let cleaned = false;
  const listeners = [];

  const button = addAttribute(documentObject.createElement('button'));
  button.type = 'button';
  button.className = BUTTON_CLASS;
  button.textContent = '添加注释';
  button.setAttribute('aria-label', '添加注释');
  button.hidden = true;

  const popover = addAttribute(documentObject.createElement('div'));
  popover.className = POPOVER_CLASS;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', '添加上下文注释');
  popover.hidden = true;

  const title = addAttribute(documentObject.createElement('div'));
  title.setAttribute('data-dsh-context-selection-title', 'true');
  title.textContent = '添加注释';

  const textarea = addAttribute(documentObject.createElement('textarea'));
  textarea.setAttribute('data-dsh-context-selection-input', 'true');
  textarea.setAttribute('aria-label', '注释内容');
  textarea.placeholder = '写下你想补充的内容（可留空）';
  textarea.rows = 2;

  const hint = addAttribute(documentObject.createElement('div'));
  hint.setAttribute('data-dsh-context-selection-hint', 'true');
  hint.textContent = 'Enter 保存 · Shift+Enter 换行 · Esc 取消';

  const actions = addAttribute(documentObject.createElement('div'));
  actions.setAttribute('data-dsh-context-selection-actions', 'true');
  const cancelButton = addAttribute(documentObject.createElement('button'));
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.setAttribute('data-dsh-context-selection-cancel', 'true');
  const saveButton = addAttribute(documentObject.createElement('button'));
  saveButton.type = 'button';
  saveButton.textContent = '保存';
  saveButton.setAttribute('data-dsh-context-selection-save', 'true');
  actions.append(cancelButton, saveButton);
  popover.append(title, textarea, hint, actions);
  mount.append(button, popover);

  function addListener(target, type, handler, optionsOrCapture) {
    target.addEventListener(type, handler, optionsOrCapture);
    listeners.push({ target, type, handler, options: optionsOrCapture });
  }

  function uiContains(target) {
    const element = asElement(target);
    return !!(element && (element === button || element === popover || popover.contains(element) || button.contains(element)));
  }

  function clearScheduledSelection() {
    if (!selectionFrame) return;
    if (selectionFrameType === 'raf' && typeof windowObject.cancelAnimationFrame === 'function') {
      windowObject.cancelAnimationFrame(selectionFrame);
    } else {
      windowObject.clearTimeout(selectionFrame);
    }
    selectionFrame = 0;
    selectionFrameType = '';
  }

  function hideButton() {
    button.hidden = true;
  }

  function closePopover() {
    popoverOpen = false;
    popover.hidden = true;
    textarea.value = '';
  }

  function clearSelectionUi() {
    selectionData = null;
    hideButton();
    closePopover();
  }

  function buttonSize() {
    return {
      width: button.offsetWidth || 88,
      height: button.offsetHeight || 30
    };
  }

  function placeButton() {
    if (!active || !selectionData || button.hidden) return;
    const rect = rangeRect(selectionData.range);
    if (!rect) {
      hideButton();
      return;
    }
    const size = buttonSize();
    const viewportWidth = Math.max(0, windowObject.innerWidth || documentObject.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(0, windowObject.innerHeight || documentObject.documentElement.clientHeight || 0);
    const center = rect.left + (rect.width || 0) / 2;
    const left = clamp(center - size.width / 2, MARGIN, viewportWidth - size.width - MARGIN);
    let top = rect.top - size.height - MARGIN;
    if (top < MARGIN) top = rect.bottom + MARGIN;
    top = clamp(top, MARGIN, viewportHeight - size.height - MARGIN);
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
  }

  function placePopover() {
    if (!active || !popoverOpen || popover.hidden) return;
    let anchor = button.getBoundingClientRect();
    if (button.hidden && selectionData) {
      const selectionAnchor = rangeRect(selectionData.range);
      if (selectionAnchor) anchor = selectionAnchor;
    }
    const viewportWidth = Math.max(0, windowObject.innerWidth || documentObject.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(0, windowObject.innerHeight || documentObject.documentElement.clientHeight || 0);
    const width = popover.offsetWidth || Math.min(320, Math.max(160, viewportWidth - MARGIN * 2));
    const height = popover.offsetHeight || 170;
    const left = clamp(anchor.left, MARGIN, viewportWidth - width - MARGIN);
    let top = anchor.bottom + MARGIN;
    if (top + height > viewportHeight - MARGIN) top = anchor.top - height - MARGIN;
    top = clamp(top, MARGIN, viewportHeight - height - MARGIN);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }

  function placeUi() {
    placeButton();
    placePopover();
  }

  function showButton() {
    if (!active || !selectionData || popoverOpen) return;
    button.hidden = false;
    placeButton();
  }

  function saveAnnotation() {
    if (!active || !selectionData) return;
    const data = selectionData;
    const range = data.range.cloneRange();
    const sessionId = data.sessionId;

    try {
      if (typeof onAnnotate === 'function') {
        onAnnotate({
          sessionId,
          kind: 'context',
          text: data.text,
          comment: textarea.value,
          title: String(documentObject.title || ''),
          url: String(windowObject.location && windowObject.location.href ? windowObject.location.href : ''),
          selector: data.selector,
          range
        });
      }
    } finally {
      clearSelectionUi();
    }
  }

  function openPopover(event) {
    if (!active || !selectionData) return;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    button.hidden = true;
    popoverOpen = true;
    popover.hidden = false;
    textarea.value = '';
    placePopover();
    windowObject.setTimeout(() => {
      if (active && popoverOpen) textarea.focus({ preventScroll: true });
      placePopover();
    }, 0);
  }

  function updateFromSelection() {
    selectionFrame = 0;
    selectionFrameType = '';
    if (!active) return;
    const next = selectionIsUsable(windowObject.getSelection ? windowObject.getSelection() : null, documentObject);
    if (next) {
      if (popoverOpen) closePopover();
      next.sessionId = typeof getSessionId === 'function' ? getSessionId() : undefined;
      selectionData = next;
      showButton();
      return;
    }

    // Focusing the annotation textarea can collapse the browser selection. In
    // that case the saved Range remains the source of truth until save/cancel.
    if (!popoverOpen) clearSelectionUi();
  }

  function scheduleSelectionUpdate() {
    if (!active || selectionFrame) return;
    if (typeof windowObject.requestAnimationFrame === 'function') {
      selectionFrameType = 'raf';
      selectionFrame = windowObject.requestAnimationFrame(updateFromSelection);
    } else {
      selectionFrameType = 'timeout';
      selectionFrame = windowObject.setTimeout(updateFromSelection, 0);
    }
  }

  function preserveSelection(event) {
    // Preventing the default press keeps the selected page text available for
    // native copy while the click handler opens our popover.
    event.preventDefault();
  }

  function handleOutsidePointerDown(event) {
    if (uiContains(event.target)) return;
    clearSelectionUi();
  }

  function handleDocumentKeydown(event) {
    if (!active || !popoverOpen || uiContains(event.target)) return;
    if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
      event.preventDefault();
      clearSelectionUi();
    }
  }

  function handleTextareaKeydown(event) {
    if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
      event.preventDefault();
      clearSelectionUi();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      saveAnnotation();
    }
  }

  function handleCancel(event) {
    event.preventDefault();
    event.stopPropagation();
    clearSelectionUi();
  }

  function handleResizeOrScroll() {
    if (!active) return;
    placeUi();
  }

  addListener(button, 'pointerdown', preserveSelection);
  addListener(button, 'mousedown', preserveSelection);
  addListener(button, 'click', openPopover);
  addListener(textarea, 'keydown', handleTextareaKeydown);
  addListener(saveButton, 'click', saveAnnotation);
  addListener(cancelButton, 'click', handleCancel);
  addListener(documentObject, 'selectionchange', scheduleSelectionUpdate);
  addListener(documentObject, 'mouseup', scheduleSelectionUpdate, true);
  addListener(documentObject, 'keyup', scheduleSelectionUpdate, true);
  addListener(documentObject, 'pointerdown', handleOutsidePointerDown, true);
  addListener(documentObject, 'keydown', handleDocumentKeydown, true);
  addListener(windowObject, 'resize', handleResizeOrScroll);
  addListener(windowObject, 'scroll', handleResizeOrScroll, true);
  addListener(documentObject, 'scroll', handleResizeOrScroll, true);

  const cleanup = function cleanupContextSelection() {
    if (cleaned) return;
    cleaned = true;
    active = false;
    clearScheduledSelection();
    for (const listener of listeners) {
      listener.target.removeEventListener(listener.type, listener.handler, listener.options);
    }
    listeners.length = 0;
    if (button.parentNode) button.parentNode.removeChild(button);
    if (popover.parentNode) popover.parentNode.removeChild(popover);
    if (style.created && style.element.parentNode) style.element.parentNode.removeChild(style.element);
    if (windowObject.__dshContextSelectionCleanup === cleanup) {
      delete windowObject.__dshContextSelectionCleanup;
    }
  };

  windowObject.__dshContextSelectionCleanup = cleanup;
  return cleanup;
}
