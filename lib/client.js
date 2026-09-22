window.__ModuleLoader__.load({
  id: 'dsh-sidebar-annotations',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    function readElementSource(element) {
  const owner = element?.closest?.('[data-dsh-source-file][data-dsh-source-line]');
  if (!owner) return null;
  const file = owner.getAttribute('data-dsh-source-file');
  const line = Number(owner.getAttribute('data-dsh-source-line'));
  if (!file || !Number.isInteger(line) || line < 1) return null;
  return {file, line};
}

function installPicker(sourceReader) {
  // A previous installation may still have document listeners and an overlay.
  // Stop it before installing a fresh picker so repeated injections stay safe.
  if (
    window.__dshWorkbenchPicker &&
    typeof window.__dshWorkbenchPicker.stop === 'function'
  ) {
    window.__dshWorkbenchPicker.stop();
  }

  var active = true;
  // Keep the page in picker mode after a pick has been recorded.  The host
  // polls __dshWorkbenchPick asynchronously, so stopping here would briefly
  // re-enable links/buttons before the comment editor has been saved or
  // cancelled.  The client owns the lifecycle and calls stop() once the
  // editor is closed.
  var selectionLocked = false;
  window.__dshWorkbenchPickerActive = true;
  window.__dshWorkbenchPickerLocked = false;
  var hoveredElement = null;
  var listeners = [];
  var overlay = document.createElement('div');
  var captureLayer = document.createElement('div');

  overlay.setAttribute('data-dsh-workbench-picker-overlay', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.position = 'fixed';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '2147483647';
  overlay.style.boxSizing = 'border-box';
  overlay.style.display = 'none';
  overlay.style.border = '2px solid rgba(37, 99, 235, 0.95)';
  overlay.style.background = 'rgba(37, 99, 235, 0.08)';
  overlay.style.borderRadius = '2px';
  overlay.style.transition = 'none';

  // A full-viewport transparent hit target keeps normal pointer events away
  // from the page while picking.  The selected element is resolved below by
  // temporarily taking this layer out of hit testing and calling
  // elementsFromPoint.  This is important for anchors and buttons: a
  // document capture listener runs after a window capture listener, while a
  // real hit target prevents the browser from dispatching the event to the
  // underlying control in the first place.
  captureLayer.setAttribute('data-dsh-workbench-picker-capture', 'true');
  captureLayer.setAttribute('aria-hidden', 'true');
  captureLayer.tabIndex = -1;
  captureLayer.style.position = 'fixed';
  captureLayer.style.left = '0';
  captureLayer.style.top = '0';
  captureLayer.style.width = '100vw';
  captureLayer.style.height = '100vh';
  captureLayer.style.pointerEvents = 'auto';
  captureLayer.style.zIndex = '2147483647';
  captureLayer.style.background = 'transparent';
  captureLayer.style.cursor = 'crosshair';
  captureLayer.style.touchAction = 'none';
  captureLayer.style.userSelect = 'none';

  var root = document.documentElement || document.body;
  root.appendChild(captureLayer);
  root.appendChild(overlay);

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push({ target: target, type: type, handler: handler, options: options });
  }

  function clearOverlay() {
    hoveredElement = null;
    overlay.style.display = 'none';
  }

  function stopEvent(event) {
    if (!event) return;
    try { event.preventDefault(); } catch (error) {}
    try { event.stopPropagation(); } catch (error) {}
    if (typeof event.stopImmediatePropagation === 'function') {
      try { event.stopImmediatePropagation(); } catch (error) {}
    }
  }

  function eventPoint(event) {
    if (!event) return null;
    var source = event;
    if ((!isFinite(source.clientX) || !isFinite(source.clientY)) && event.touches && event.touches.length) {
      source = event.touches[0];
    }
    if ((!isFinite(source.clientX) || !isFinite(source.clientY)) && event.changedTouches && event.changedTouches.length) {
      source = event.changedTouches[0];
    }
    if (!isFinite(source.clientX) || !isFinite(source.clientY)) return null;
    return {x: source.clientX, y: source.clientY};
  }

  function isPickerElement(element) {
    if (!element || element.nodeType !== 1) return true;
    if (element === overlay || element === captureLayer) return true;
    try {
      return !!(
        element.hasAttribute &&
        (element.hasAttribute('data-dsh-workbench-picker-overlay') ||
          element.hasAttribute('data-dsh-workbench-picker-capture'))
      );
    } catch (error) {
      return false;
    }
  }

  function elementAtPoint(event) {
    var point = eventPoint(event);
    if (!point) return null;

    // The capture layer is intentionally the hit target.  Take it out of
    // hit testing only for this synchronous lookup; it is restored before
    // the event handler returns so no page event can slip through.
    var previousPointerEvents = captureLayer.style.pointerEvents;
    captureLayer.style.pointerEvents = 'none';
    var elements = [];
    try {
      if (typeof document.elementsFromPoint === 'function') {
        elements = document.elementsFromPoint(point.x, point.y) || [];
      } else if (typeof document.elementFromPoint === 'function') {
        var single = document.elementFromPoint(point.x, point.y);
        if (single) elements = [single];
      }
    } catch (error) {
      elements = [];
    } finally {
      captureLayer.style.pointerEvents = previousPointerEvents;
    }

    for (var index = 0; index < elements.length; index += 1) {
      var candidate = elements[index];
      if (!isPickerElement(candidate)) return candidate;
    }
    return null;
  }

  function updateOverlay(element) {
    if (!active || !element || element === overlay || !element.getBoundingClientRect) {
      clearOverlay();
      return;
    }

    var rect;
    try {
      rect = element.getBoundingClientRect();
    } catch (error) {
      clearOverlay();
      return;
    }

    if (!rect || !isFinite(rect.left) || !isFinite(rect.top)) {
      clearOverlay();
      return;
    }

    hoveredElement = element;
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = Math.max(0, rect.width) + 'px';
    overlay.style.height = Math.max(0, rect.height) + 'px';
  }

  function elementFromEvent(event) {
    var pointElement = elementAtPoint(event);
    if (pointElement) return pointElement;

    var path = [];
    if (event && typeof event.composedPath === 'function') {
      try {
        path = event.composedPath();
      } catch (error) {
        path = [];
      }
    }

    for (var i = 0; i < path.length; i += 1) {
      var item = path[i];
      if (
        item &&
        item.nodeType === 1 &&
        item !== overlay &&
        item !== captureLayer &&
        !(overlay.contains && overlay.contains(item)) &&
        !(captureLayer.contains && captureLayer.contains(item))
      ) {
        return item;
      }
    }

    var target = event && event.target;
    if (target && target.nodeType === 3) {
      target = target.parentElement;
    }
    if (
      target &&
      target.nodeType === 1 &&
      target !== overlay &&
      target !== captureLayer &&
      !(overlay.contains && overlay.contains(target)) &&
      !(captureLayer.contains && captureLayer.contains(target))
    ) {
      return target;
    }
    return null;
  }

  function escapeCss(value) {
    var text = String(value);
    if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
      return CSS.escape(text);
    }

    // CSS.escape is available in current Chromium, but keep the injected
    // function usable in older embedded documents as well.
    var escaped = '';
    for (var i = 0; i < text.length; i += 1) {
      var character = text.charAt(i);
      var code = text.charCodeAt(i);
      if (code === 0) {
        escaped += '\ufffd';
      } else if (
        (code >= 1 && code <= 31) ||
        code === 127 ||
        (i === 0 && code >= 48 && code <= 57) ||
        (i === 1 && code >= 48 && code <= 57 && text.charAt(0) === '-')
      ) {
        escaped += '\\' + code.toString(16) + ' ';
      } else if (i === 0 && character === '-' && text.length === 1) {
        escaped += '\\-';
      } else if (
        code >= 128 ||
        character === '-' ||
        character === '_' ||
        (code >= 48 && code <= 57) ||
        (code >= 65 && code <= 90) ||
        (code >= 97 && code <= 122)
      ) {
        escaped += character;
      } else {
        escaped += '\\' + character;
      }
    }
    return escaped;
  }

  function makeSelector(element) {
    if (element.id) {
      var direct = '#' + escapeCss(element.id);
      if (document.querySelectorAll(direct).length === 1) return direct;
    }
    var parts = [];
    var current = element;
    var depth = 0;

    while (current && current.nodeType === 1 && depth < 6) {
      var tag = String(current.localName || current.tagName || '*').toLowerCase();
      var part = tag || '*';
      var id = '';
      try {
        id = current.id || '';
      } catch (error) {
        id = '';
      }
      if (id) {
        part += '#' + escapeCss(id);
      } else if (current.classList && current.classList.length) {
        var classes = [];
        for (var classIndex = 0; classIndex < current.classList.length; classIndex += 1) {
          var className = current.classList[classIndex];
          if (className) {
            classes.push('.' + escapeCss(className));
          }
          if (classes.length === 2) {
            break;
          }
        }
        part += classes.join('');
      }

      var typeIndex = 1;
      var sibling = current.previousElementSibling;
      while (sibling) {
        if (
          String(sibling.localName || sibling.tagName || '').toLowerCase() === tag
        ) {
          typeIndex += 1;
        }
        sibling = sibling.previousElementSibling;
      }
      part += ':nth-of-type(' + typeIndex + ')';
      parts.unshift(part);
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(' > ');
  }

  function limitedText(value, limit) {
    return String(value == null ? '' : value).slice(0, limit);
  }

  function getElementText(element) {
    var value = '';
    try {
      value = typeof element.innerText === 'string' ? element.innerText : element.textContent;
    } catch (error) {
      value = element.textContent || '';
    }
    return limitedText(value, 3000);
  }

  function getRect(element) {
    var rect;
    try {
      rect = element.getBoundingClientRect();
    } catch (error) {
      return null;
    }
    if (!rect) {
      return null;
    }
    return {
      x: typeof rect.x === 'number' ? rect.x : rect.left,
      y: typeof rect.y === 'number' ? rect.y : rect.top,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    };
  }

  function recordPick(element) {
    var outerHTML = '';
    try {
      outerHTML = element.outerHTML || '';
    } catch (error) {
      outerHTML = '';
    }

    window.__dshWorkbenchPick = {
      selector: makeSelector(element),
      tag: String(element.localName || element.tagName || '').toLowerCase(),
      text: getElementText(element),
      outerHTML: limitedText(outerHTML, 4000),
      url: String(window.location && window.location.href ? window.location.href : ''),
      title: String(document.title || ''),
      rect: getRect(element),
      captureMode: 'element',
      source: sourceReader ? sourceReader(element) : null
    };
    selectionLocked = true;
    window.__dshWorkbenchPickerLocked = true;
  }

  function stop() {
    if (!active) {
      return;
    }
    active = false;
    selectionLocked = false;
    window.__dshWorkbenchPickerActive = false;
    window.__dshWorkbenchPickerLocked = false;
    for (var i = 0; i < listeners.length; i += 1) {
      var entry = listeners[i];
      entry.target.removeEventListener(entry.type, entry.handler, entry.options);
    }
    listeners = [];
    clearOverlay();
    if (captureLayer.parentNode) {
      captureLayer.parentNode.removeChild(captureLayer);
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  function handleMove(event) {
    if (selectionLocked) {
      stopEvent(event);
      return;
    }
    stopEvent(event);
    updateOverlay(elementFromEvent(event));
  }

  function handleLeave(event) {
    if (!event.relatedTarget) {
      clearOverlay();
    }
  }

  function handleResizeOrScroll() {
    if (hoveredElement) {
      updateOverlay(hoveredElement);
    }
  }

  function handleClick(event) {
    if (!active) {
      return;
    }
    stopEvent(event);
    if (selectionLocked) return;
    var element = elementFromEvent(event);
    if (!element) {
      return;
    }
    recordPick(element);
  }

  function handleOtherAction(event) {
    if (!active) {
      return;
    }
    stopEvent(event);
  }

  function handlePointerDown(event) {
    if (!active) return;
    stopEvent(event);
    if (selectionLocked) return;

    // Commit on pointer/touch down.  Preventing the default pointerdown is
    // necessary to suppress compatibility mouse/click activation, so waiting
    // for click would be unreliable for links and form controls.
    if (event && event.button != null && event.button !== 0) return;
    var element = elementFromEvent(event);
    if (element) recordPick(element);
  }

  function handleKeydown(event) {
    if (!active) return;
    stopEvent(event);
    if (event.key === 'Escape' || event.key === 'Esc' || event.keyCode === 27) {
      stop();
    }
  }

  window.__dshWorkbenchPick = null;
  window.__dshWorkbenchPicker = {
    stop: stop,
    release: stop,
    isLocked: function() { return selectionLocked; }
  };

  // Window capture is the earliest practical interception point.  The
  // transparent layer handles the actual hit testing, while these listeners
  // also cover synthetic events and stop page-level window/document handlers.
  addListener(window, 'pointermove', handleMove, true);
  addListener(window, 'mousemove', handleMove, true);
  addListener(window, 'touchmove', handleMove, true);
  addListener(window, 'pointerdown', handlePointerDown, true);
  addListener(window, 'touchstart', handlePointerDown, true);
  addListener(window, 'mousedown', handlePointerDown, true);
  addListener(window, 'pointerup', handleOtherAction, true);
  addListener(window, 'pointercancel', handleOtherAction, true);
  addListener(window, 'touchend', handleOtherAction, true);
  addListener(window, 'touchcancel', handleOtherAction, true);
  addListener(window, 'mouseup', handleOtherAction, true);
  addListener(window, 'click', handleClick, true);
  addListener(window, 'dblclick', handleOtherAction, true);
  addListener(window, 'auxclick', handleOtherAction, true);
  addListener(window, 'contextmenu', handleOtherAction, true);
  addListener(window, 'keydown', handleKeydown, true);
  addListener(window, 'keypress', handleOtherAction, true);
  addListener(window, 'keyup', handleOtherAction, true);

  // Keep target listeners as a fallback for documents that do not expose
  // window capture consistently (some embedded mini-program runtimes).
  addListener(captureLayer, 'pointermove', handleMove, false);
  addListener(captureLayer, 'mousemove', handleMove, false);
  addListener(captureLayer, 'touchmove', handleMove, false);
  addListener(captureLayer, 'pointerdown', handlePointerDown, false);
  addListener(captureLayer, 'touchstart', handlePointerDown, false);
  addListener(captureLayer, 'mousedown', handlePointerDown, false);
  addListener(captureLayer, 'pointerup', handleOtherAction, false);
  addListener(captureLayer, 'pointercancel', handleOtherAction, false);
  addListener(captureLayer, 'touchend', handleOtherAction, false);
  addListener(captureLayer, 'touchcancel', handleOtherAction, false);
  addListener(captureLayer, 'mouseup', handleOtherAction, false);
  addListener(captureLayer, 'click', handleClick, false);
  addListener(captureLayer, 'dblclick', handleOtherAction, false);
  addListener(captureLayer, 'auxclick', handleOtherAction, false);
  addListener(captureLayer, 'contextmenu', handleOtherAction, false);
  addListener(document, 'mousemove', handleMove, true);
  addListener(document, 'mouseout', handleLeave, true);
  addListener(document, 'click', handleClick, true);
  addListener(document, 'pointerdown', handleOtherAction, true);
  addListener(document, 'mousedown', handleOtherAction, true);
  addListener(document, 'pointerup', handleOtherAction, true);
  addListener(document, 'mouseup', handleOtherAction, true);
  addListener(document, 'dblclick', handleOtherAction, true);
  addListener(document, 'auxclick', handleOtherAction, true);
  addListener(document, 'contextmenu', handleOtherAction, true);
  addListener(document, 'keydown', handleKeydown, true);
  addListener(window, 'resize', handleResizeOrScroll, true);
  addListener(window, 'scroll', handleResizeOrScroll, true);

  return window.__dshWorkbenchPicker;
}

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

function installContextSelection(options = {}) {
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

    const CSS_TEXT = ".dwb-root{position:absolute;inset:0;display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#202124);font:13px/1.5 system-ui,-apple-system,sans-serif}\n.dwb-root *,.dwb-rail *{box-sizing:border-box}.dwb-bar{display:flex;align-items:center;gap:5px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,#ddd);flex:none;min-width:0}.dwb-root button,.dwb-rail button{font:inherit;color:inherit;background:transparent;border:0;border-radius:7px;padding:5px 9px;cursor:pointer;white-space:nowrap}.dwb-root button:hover,.dwb-rail button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}.dwb-root button:disabled{opacity:.35;cursor:default}.dwb-root button:focus-visible,.dwb-rail button:focus-visible{outline:2px solid #5685e9;outline-offset:1px}.dwb-root button[aria-pressed=true]{color:#4477dc;background:#4477dc18}.dwb-url{width:0;flex:1;min-width:75px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;padding:6px 9px;background:var(--dsw-alias-bg-layer-1,#f6f6f6);color:inherit;font:12px/1.5 system-ui}.dwb-tools{flex-wrap:wrap;padding:5px 10px}.dwb-spacer{flex:1}.dwb-muted{font-size:11px;opacity:.6}.dwb-stage{position:relative;display:flex;justify-content:center;flex:1;min-height:100px;overflow:auto;background:repeating-conic-gradient(#8881 0% 25%,transparent 0% 50%) 50%/16px 16px}.dwb-stage webview{display:flex;flex-shrink:0;height:100%;background:white}.dwb-empty{margin:auto;padding:28px;max-width:360px;text-align:center}.dwb-empty h3{font-size:19px;font-weight:550;margin:12px 0}.dwb-empty p{opacity:.65;line-height:1.8}.dwb-status{padding:4px 12px;font-size:11px;opacity:.7;border-top:1px solid var(--dsw-alias-border-l1,#ddd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dwb-error{padding:10px 12px;background:#db553218;color:#c45438;overflow-wrap:anywhere;flex:none}.dwb-comment{position:absolute;bottom:16px;left:12px;right:12px;z-index:3;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 8px 30px #0002;padding:12px}.dwb-comment code{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;opacity:.6}.dwb-comment textarea,.dwb-edit{display:block;width:100%;margin:8px 0;padding:9px;min-height:70px;resize:vertical;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;font:13px/1.5 system-ui;background:transparent;color:inherit}.dwb-comment footer{display:flex;justify-content:flex-end;gap:5px}.dwb-primary{background:var(--dsw-alias-label-primary,#202124)!important;color:var(--dsw-alias-bg-base,#fff)!important}.dwb-console{height:180px;min-height:80px;max-height:45%;resize:vertical;overflow:auto;flex:none;border-top:1px solid var(--dsw-alias-border-l1,#ddd);background:var(--dsw-alias-bg-layer-1,#fafafa)}.dwb-log{display:flex;gap:8px;padding:5px 10px;font:11px/1.5 ui-monospace,monospace;border-bottom:1px solid #8882;white-space:pre-wrap;overflow-wrap:anywhere}.dwb-log>span{flex:1;min-width:0}.dwb-log[data-level=error]{color:#dc5a47}.dwb-log[data-level=warning]{color:#ad7a29}.dwb-console-input{display:flex;padding:5px;gap:5px}.dwb-console-input input{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:12px monospace;outline:none}.dwb-rail{width:calc(100% - 32px);max-width:780px;align-self:center;margin:0 auto 6px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fafafa);color:var(--dsw-alias-label-primary,#202124);font:12px/1.5 system-ui;overflow:hidden}.dwb-rail-head{display:flex;align-items:center;padding:5px 8px;gap:5px}.dwb-rail-list{max-height:235px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1,#ddd)}.dwb-note{padding:9px 12px;border-bottom:1px solid #8882;display:flex;gap:9px}.dwb-number{font-size:11px;flex:none;width:21px;height:21px;border-radius:7px;display:grid;place-items:center;background:#5685e91b;color:#5685e9}.dwb-note-body{flex:1;min-width:0}.dwb-note-title{font-size:11px;opacity:.6;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.dwb-note blockquote{margin:3px 0;padding-left:8px;border-left:2px solid #8885;max-height:48px;overflow:hidden;white-space:pre-wrap}.dwb-note-comment{white-space:pre-wrap;overflow-wrap:anywhere}.dwb-note-actions{display:flex;align-items:flex-start}.dwb-launch{font:12px system-ui!important;white-space:nowrap;background:transparent;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:7px;padding:4px 8px;color:inherit;cursor:pointer}\n\n.dwb-picked-text{margin:8px 0;max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;background:#8881;border-radius:6px;font-size:12px;line-height:1.6}\n\n/* Compact annotation attachment chip; the detail surface floats above the composer. */\n.dwb-rail{position:relative;overflow:visible;border:0;background:transparent;margin-bottom:4px}\n.dwb-rail-head{display:inline-flex;border:1px solid var(--dsw-alias-border-l1,#555);border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);padding:3px 5px}\n.dwb-rail-list{position:absolute;bottom:100%;left:0;width:min(560px,100%);max-height:340px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#555);border-radius:14px;box-shadow:0 8px 32px #0003;background:var(--dsw-alias-bg-layer-1,#fff);z-index:100}\n.dwb-note{padding:14px;gap:10px}.dwb-note:last-child{border-bottom:0}.dwb-note blockquote{max-height:100px;overflow:auto;border:0;padding:0;opacity:.65;line-height:1.6}.dwb-note-comment{font-size:14px;margin-top:7px}.dwb-number{width:auto;min-width:24px;padding:0 5px}.dwb-note-send{color:#5685e9!important}\n";
    const KIND = 'dsh-sidebar-annotations';
    const stores = new Map();
    const browserHandlers = new Map();
    const bridgeListeners = new Set();
    let bridgeStatus = '连接 DSH…';
    function reportBridge(status) {if (status !== bridgeStatus) {bridgeStatus=status;bridgeListeners.forEach(fn=>fn());}}
    let ctx;
    function currentSession() { return ctx.sessions.list.getSnapshot().current; }
    function inputFor(id) {
      const scope = ctx.sessions.scope(id);
      if (!scope) throw new Error('请先打开一个会话');
      return ctx.get('conversation').input.for(scope);
    }
    function storeFor(id) {
      if (!stores.has(id)) {
        let notes = [];
        try { notes = JSON.parse(localStorage.getItem('dwb:notes:' + id) || '[]'); } catch {}
        stores.set(id, {notes: Array.isArray(notes) ? notes : [], listeners: new Set()});
      }
      return stores.get(id);
    }
    function publish(id, notes) {
      const store = storeFor(id);
      store.notes = notes;
      try { localStorage.setItem('dwb:notes:' + id, JSON.stringify(notes.map(({range, ...note}) => note))); } catch {}
      store.listeners.forEach(fn => fn());
    }
    function useNotes(id) {
      return React.useSyncExternalStore(React.useCallback(fn => {
        const store = storeFor(id); store.listeners.add(fn); return () => store.listeners.delete(fn);
      }, [id]), React.useCallback(() => storeFor(id).notes, [id]));
    }
    function useSession() {
      return React.useSyncExternalStore(fn => ctx.sessions.list.subscribe(fn), currentSession);
    }
    function noteText(note) {
      // Element picks must never inherit an unrelated browser text selection.
      return note.kind === 'element' && note.captureMode !== 'selection'
        ? note.text || note.tag || '' : note.selection || note.text || note.tag || '';
    }
    function sourceLabel(note) {
      return note.source?.file && Number.isInteger(note.source.line) && note.source.line > 0
        ? `${note.source.file}:${note.source.line}` : '';
    }
    function blockFor(note) {
      const quote = value => String(value || '').split('\n').map(line => '> ' + line).join('\n');
      const source = note.kind === 'context' ? '上下文' : note.kind === 'console' ? '调试日志' : '网页元素';
      return `【注释 ${note.id} · ${source}】\n用户意见：${note.comment || '请查看这处内容'}\n${quote((note.title || '') + ' ' + (note.url || ''))}\n${note.selector ? quote('定位：' + note.selector) + '\n' : ''}${sourceLabel(note) ? quote('源码（WXML）：' + sourceLabel(note)) + '\n' : ''}${quote(noteText(note))}\n【注释结束 ${note.id}】`;
    }
    function addNote(data) {
      const id = data.sessionId || currentSession();
      if (!id) throw new Error('请先打开一个会话');
      const note = {...data, id: crypto.randomUUID().slice(0, 8)};
      publish(id, [...storeFor(id).notes, note]);
    }
    function updateNote(id, note, comment) {
      publish(id, storeFor(id).notes.map(n => n.id === note.id ? {...n, comment} : n));
    }
    function removeNote(id, note) {
      publish(id, storeFor(id).notes.filter(n => n.id !== note.id));
    }
    function migrateDraftNotes(id) {
      const input = inputFor(id), before = input.state.getSnapshot().draft || '';
      let next = before;
      for (const note of storeFor(id).notes) if (note.block) next = next.replace(note.block, '');
      if (next !== before) input.setDraft(next.trim());
    }
    function installAnnotationSend(service) {
      const original = service.sendSession;
      if (typeof original !== 'function') throw new Error('当前 DSH 版本不支持注释附件发送');
      async function sendWithNotes(session, text, attachments, mode, signal) {
        const id = session.sessionId;
        const batch = storeFor(id).notes.slice();
        if (!batch.length) return original.call(this, session, text, attachments, mode, signal);
        const ids = new Set(batch.map(n => n.id));
        const payload = [text, batch.map(blockFor).join('\n\n')].filter(Boolean).join('\n\n');
        // Reserve this batch before awaiting: a second send cannot duplicate it.
        publish(id, storeFor(id).notes.filter(n => !ids.has(n.id)));
        const restore = () => publish(id, [...batch, ...storeFor(id).notes.filter(n => !ids.has(n.id))]);
        try {
          const result = await original.call(this, session, payload, attachments, mode, signal);
          if (result?.kind !== 'success') restore();
          return result;
        } catch (error) {restore(); throw error;}
      }
      service.sendSession = sendWithNotes;
      return () => {if (service.sendSession === sendWithNotes) service.sendSession = original;};
    }
    async function sendNotesOnly(id) {
      const input = inputFor(id), state = input.state.getSnapshot();
      if (state.draft?.trim() || state.attachmentIds?.length) {input.submit(); return;}
      if (!storeFor(id).notes.length) return;
      if (ctx.get('conversation').blocks.storeFor(id).getSnapshot()) throw new Error('当前会话暂时不能发送，请先完成输入框提示的设置');
      const scope = ctx.sessions.scope(id), session = scope && ctx.sessions.sessionOf(scope);
      if (!session) throw new Error('当前会话尚未就绪');
      const result = await ctx.get('conversation').sendSession(session, '', [], 'queue');
      if (result?.kind !== 'success') throw new Error(result?.text || '注释发送失败，请重试');
    }
    const button = (label, onClick, props = {}) => h('button', {type: 'button', title: label, 'aria-label': label, onClick, ...props}, props.children || label);
    function AnnotationRail(props) {
      const current = useSession(), id = props.sessionId || current;
      const notes = useNotes(id);
      const [open, setOpen] = React.useState(false), [editing, setEditing] = React.useState(null), [comment, setComment] = React.useState('');
      const [error, setError] = React.useState('');
      React.useEffect(() => {
        if (!id) return;
        try {migrateDraftNotes(id);} catch {}
        const onKey = e => {
          if (e.key === 'Escape') {setOpen(false);setEditing(null);return;}
          if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
          const input = inputFor(id), root = input.editor?.getRootElement();
          const state = input.state.getSnapshot();
          if (!root?.contains(e.target) || state.draft?.trim() || state.attachmentIds?.length || !storeFor(id).notes.length) return;
          e.preventDefault(); e.stopImmediatePropagation();
          void sendNotesOnly(id).catch(err => setError(err.message));
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [id]);
      React.useEffect(() => { setEditing(null); setError(''); }, [id]);
      React.useEffect(() => {
        const layer = document.createElement('div'); layer.setAttribute('data-dsh-annotation-ui', 'true');
        layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1000';
        const marks = notes.map((note, index) => {
          if (!note.range) return null;
          const badge = document.createElement('button'); badge.textContent = String(index + 1);
          badge.title = note.comment || '查看注释';
          badge.style.cssText = 'position:fixed;pointer-events:auto;border:2px solid white;border-radius:12px;min-width:23px;height:23px;background:#5685e9;color:white;font:600 11px system-ui;cursor:pointer';
          badge.onclick = () => setOpen(true); layer.appendChild(badge); return {note, badge};
        }).filter(Boolean);
        const position = () => marks.forEach(({note, badge}) => {
          const rect = note.range.getBoundingClientRect();
          badge.hidden = !note.range.startContainer.isConnected || !rect.width || rect.bottom < 0 || rect.top > innerHeight;
          badge.style.left = Math.min(innerWidth - 26, rect.right - 8) + 'px'; badge.style.top = Math.max(0, rect.top - 16) + 'px';
        });
        document.body.appendChild(layer); position();
        window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
        return () => {layer.remove(); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position);};
      }, [notes]);
      if (!notes.length) return null;
      return h('section', {className: 'dwb-rail', 'data-dsh-annotation-ui': true, onMouseEnter: () => setOpen(true), onMouseLeave: () => {if (!editing) setOpen(false);}, onFocus: () => setOpen(true), onBlur: e => {if (!e.currentTarget.contains(e.relatedTarget) && !editing) setOpen(false);}, onKeyDown: e => {if (e.key === 'Escape') {setOpen(false);setEditing(null);}}},
        h('div', {className: 'dwb-rail-head'}, button(`▢ ${notes.length} 条注释`, () => setOpen(true), {'aria-expanded': open}),
          button('清空注释', () => publish(id, []), {children:'×'}), h('span', {className: 'dwb-spacer'}), button('发送注释', () => {void sendNotesOnly(id).catch(err => setError(err.message));}, {children:'↑', className:'dwb-note-send'})),
        error && h('div', {className: 'dwb-error'}, error),
        open && h('div', {className: 'dwb-rail-list'}, notes.map((note, index) => h('article', {className: 'dwb-note', key: note.id},
          h('span', {className: 'dwb-number', title:note.tag || '注释'}, note.tag || String(index + 1)), h('div', {className: 'dwb-note-body'},
            h('div', {className: 'dwb-note-title', title: note.url}, note.kind === 'context' ? '上下文选区' : note.title || note.url || '网页元素'),
            h('blockquote', null, noteText(note) || note.selector),
            editing === note.id ? h('form', {onSubmit: e => {
              e.preventDefault(); try { updateNote(id, note, comment); setEditing(null); } catch (err) { setError(err.message); }
            }}, h('textarea', {className: 'dwb-edit', value: comment, onChange: e => setComment(e.target.value), autoFocus: true, 'aria-label': '编辑注释'}),
              h('button', {type: 'submit'}, '保存'), button('取消', () => setEditing(null))) : h('div', {className: 'dwb-note-comment'}, note.comment || '请查看这处内容')),
          h('div', {className: 'dwb-note-actions'},
            note.range && button('定位', () => note.range.startContainer.parentElement?.scrollIntoView({block: 'center', behavior: 'smooth'})),
            button('编辑注释', () => {setEditing(note.id); setComment(note.comment || '');}, {children:'✎'}),
            button('删除注释', () => removeNote(id, note), {children:'×'}))))));
    }
    function normalizeUrl(text) {
      let value = text.trim();
      if (!value) throw new Error('请输入网页地址');
      if (/^(file|javascript|data|about):/i.test(value)) throw new Error('请使用 http:// 或 https:// 地址');
      if (!value.includes('://')) value = (/^(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(value) ? 'http://' : 'https://') + value;
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请输入 http:// 或 https:// 地址；本地网页请先启动开发服务器');
      return url.href;
    }
    function readPreference(id) { try { return localStorage.getItem('dwb:url:' + id) || ''; } catch { return ''; } }
    function BrowserPanel(props) {
      const current = useSession(), id = props.sessionId || current;
      // Each session has a separate React subtree and webview navigation state.
      const panelKind = props.panelKind || KIND;
      return h(BrowserSession, {key: id + ':' + panelKind, id, panelKind, defaultUrl: props.defaultUrl || ''});
    }
    function BrowserSession({id, panelKind, defaultUrl}) {
      const preferenceKey = panelKind === KIND ? id : id + ':' + panelKind;
      const handlerKey = id + ':' + panelKind;
      const notes = useNotes(id);
      const connection = React.useSyncExternalStore(fn => {bridgeListeners.add(fn);return () => bridgeListeners.delete(fn);}, () => bridgeStatus);
      const [url, setUrl] = React.useState(() => defaultUrl || readPreference(preferenceKey));
      const [address, setAddress] = React.useState(url), [error, setError] = React.useState('');
      const [ready, setReady] = React.useState(false), [loading, setLoading] = React.useState(false), [title, setTitle] = React.useState('网页预览');
      const [unsupported, setUnsupported] = React.useState(false);
      const [picking, setPicking] = React.useState(false), [picked, setPicked] = React.useState(null), [comment, setComment] = React.useState('');
      const [viewport, setViewport] = React.useState('auto'), [consoleOpen, setConsoleOpen] = React.useState(false), [logs, setLogs] = React.useState([]), [expression, setExpression] = React.useState('');
      const [back, setBack] = React.useState(false), [forward, setForward] = React.useState(false);
      const viewRef = React.useRef(null), panelRef = React.useRef(null), commentRef = React.useRef(null);
      const latest = React.useRef(null);
      latest.current = {ready, logs, url, error};
      const addLog = React.useCallback((message, level = 'info') => setLogs(old => [...old.slice(-199), {message: String(message), level, at: new Date().toLocaleTimeString()}]), []);
      const run = async code => {
        if (!viewRef.current || !ready) throw new Error('网页尚未加载完成');
        return viewRef.current.executeJavaScript(code);
      };
      const attempt = fn => async () => { try { setError(''); await fn(); } catch (err) { setError(err.message || String(err)); } };
      const navigate = value => { try {const next = normalizeUrl(value); setError(''); setAddress(next); setUrl(next); setPicked(null); setPicking(false); } catch (err) {setError(err.message);} };
      React.useEffect(() => {if (defaultUrl) navigate(defaultUrl);}, [defaultUrl]);
      React.useEffect(() => {
        const waitForNavigation = async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          const deadline = Date.now() + 14000;
          while (Date.now() < deadline) {
            if (latest.current.error) throw new Error(latest.current.error);
            const view = viewRef.current;
            if (latest.current.ready && view && !view.isLoading()) {
              return {url: view.getURL(), title: view.getTitle()};
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          throw new Error('页面仍在加载，请检查开发服务器或网络');
        };
        async function captureScreenshot(options) {
          const view = viewRef.current;
          if (!view || typeof view.capturePage !== 'function') throw new Error('当前桌面版本不支持网页截图');
          const image = await view.capturePage();
          let dataUrl = typeof image?.toDataURL === 'function' ? image.toDataURL() : '';
          let mimeType = 'image/png';
          let data = '';
          const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
          if (match) { mimeType = match[1]; data = match[2]; }
          else if (typeof image?.toPNG === 'function') data = image.toPNG().toString('base64');
          if (!data) throw new Error('网页截图为空');
          let size;
          try { size = typeof image.getSize === 'function' ? image.getSize() : undefined; } catch {}
          return {data, mimeType, width: size?.width, height: size?.height, fullPage: options?.fullPage === true ? false : undefined};
        }
        const execute = async ({operation, args}) => {
          if (operation === 'open' || operation === 'reload') {
            setError('');
            if (operation === 'open') {
              const next = normalizeUrl(args.url); setAddress(next); setUrl(next);
              if (latest.current.url === next && viewRef.current) viewRef.current.reload();
            }
            else {if (!viewRef.current) throw new Error('请先打开网页'); viewRef.current.reload();}
            return await waitForNavigation();
          }
          if (operation === 'back' || operation === 'forward') {
            if (!viewRef.current) throw new Error('请先打开网页');
            const method = operation === 'back' ? 'goBack' : 'goForward';
            if (typeof viewRef.current[method] !== 'function') throw new Error('当前网页不支持历史导航');
            if (operation === 'back' && !viewRef.current.canGoBack()) throw new Error('没有可返回的历史页面');
            if (operation === 'forward' && !viewRef.current.canGoForward()) throw new Error('没有可前进的历史页面');
            viewRef.current[method]();
            return await waitForNavigation();
          }
          if (operation === 'close') {
            setReady(false); setUrl(''); setAddress(''); setPicked(null); setPicking(false);
            return {closed: true};
          }
          if (operation === 'screenshot') {
            if (!latest.current.ready || !viewRef.current) throw new Error('请先用 open 打开网页');
            return await captureScreenshot(args);
          }
          if (!latest.current.ready || !viewRef.current) throw new Error('请先用 open 打开网页');
          if (operation === 'console') {
            const result = latest.current.logs.filter(log => !args.level || log.level === args.level).slice(-(args.limit || 100));
            if (args.clear) setLogs([]); return result;
          }
          if (operation === 'evaluate') return await viewRef.current.executeJavaScript(args.script);
          function pageAction(operation, args) {
            const cssEscape = value => {
              if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(String(value));
              return String(value).replace(/[^a-zA-Z0-9_-]/g, character => '\\' + character);
            };
            const selectorFor = element => {
              if (element.id) {
                const direct = '#' + cssEscape(element.id);
                try { if (document.querySelectorAll(direct).length === 1) return direct; } catch {}
              }
              const parts = [], seen = new Set(); let current = element, depth = 0;
              while (current && current.nodeType === 1 && depth < 8 && !seen.has(current)) {
                seen.add(current);
                const tag = String(current.localName || current.tagName || '*').toLowerCase();
                let part = tag || '*';
                let sibling = current, nth = 1;
                while ((sibling = sibling.previousElementSibling)) if (String(sibling.localName || sibling.tagName || '').toLowerCase() === tag) nth += 1;
                part += ':nth-of-type(' + nth + ')'; parts.unshift(part);
                if (current === document.body || current === document.documentElement) break;
                current = current.parentElement; depth += 1;
              }
              return parts.join(' > ');
            };
            const visible = element => {
              if (!element || element.nodeType !== 1) return false;
              const style = getComputedStyle(element), rect = element.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && (rect.width > 0 || rect.height > 0);
            };
            const roleFor = element => {
              const explicit = element.getAttribute('role'); if (explicit) return explicit;
              const tag = String(element.localName || '').toLowerCase(), type = String(element.getAttribute('type') || '').toLowerCase();
              if (tag === 'a' && element.hasAttribute('href')) return 'link';
              if (tag === 'button') return 'button';
              if (tag === 'textarea') return 'textbox';
              if (tag === 'select') return element.multiple ? 'listbox' : 'combobox';
              if (tag === 'input') return type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : type === 'range' ? 'slider' : type === 'search' ? 'searchbox' : 'textbox';
              if (/^h[1-6]$/.test(tag)) return 'heading';
              if (tag === 'img') return 'img';
              if (tag === 'nav') return 'navigation';
              if (tag === 'main') return 'main';
              if (tag === 'form') return 'form';
              if (tag === 'summary') return 'button';
              return '';
            };
            const nameFor = element => {
              const tagName = String(element.localName || element.tagName || '').toLowerCase();
              if (tagName === 'input' && String(element.getAttribute('type') || 'text').toLowerCase() === 'password') return '[password]';
              const label = element.getAttribute('aria-label'); if (label) return label.trim();
              const labelledBy = element.getAttribute('aria-labelledby');
              if (labelledBy) { const text = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText || document.getElementById(id)?.textContent || '').join(' ').trim(); if (text) return text; }
              const alt = element.getAttribute('alt'); if (alt) return alt.trim();
              const placeholder = element.getAttribute('placeholder');
              const value = element.value;
              if (placeholder && !value) return placeholder.trim();
              if (typeof value === 'string' && value) return value.slice(0, 200);
              return String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
            };
            const collect = maxNodes => {
              const limit = Number.isInteger(maxNodes) ? Math.max(1, Math.min(500, maxNodes)) : 200;
              const nodes = [];
              for (const element of document.querySelectorAll('body *')) {
                if (!visible(element)) continue;
                const role = roleFor(element);
                const interactive = !!role && (['link','button','textbox','searchbox','checkbox','radio','combobox','listbox','slider','switch','tab','menuitem'].includes(role) || element.hasAttribute('tabindex'));
                const semantic = interactive || element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') || /^h[1-6]$/.test(String(element.localName || '').toLowerCase());
                if (!semantic) continue;
                const rect = element.getBoundingClientRect();
                const sensitive = String(element.localName || element.tagName || '').toLowerCase() === 'input' && String(element.getAttribute('type') || 'text').toLowerCase() === 'password';
                nodes.push({element, role: role || 'generic', name: nameFor(element), tag: String(element.localName || element.tagName || '').toLowerCase(), selector: selectorFor(element), value: sensitive ? '[masked]' : typeof element.value === 'string' ? element.value.slice(0, 200) : undefined, disabled: !!element.disabled || element.getAttribute('aria-disabled') === 'true', checked: element.checked === true || element.getAttribute('aria-checked') === 'true', expanded: element.getAttribute('aria-expanded') === 'true' ? true : element.getAttribute('aria-expanded') === 'false' ? false : undefined, rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}});
                if (nodes.length >= limit) break;
              }
              const indexed = nodes.map((item, index) => ({index, ...item}));
              window.__dshWorkbenchAxElements = indexed.map(item => item.element);
              window.__dshWorkbenchAxSnapshotAt = Date.now();
              return indexed;
            };
            const snapshot = maxNodes => {
              const elements = collect(maxNodes).map(({element, ...item}) => item);
              const tree = elements.map(item => `${item.index}: ${item.role}${item.name ? ' "' + item.name.replace(/"/g, '\\"') + '"' : ''}${item.disabled ? ' [disabled]' : ''}${item.checked ? ' [checked]' : ''}`).join('\n');
              return {url: location.href, title: document.title, text: String(document.body?.innerText || '').slice(0, 16000), tree, elements};
            };
            const findIndex = index => {
              if (!Number.isInteger(index) || index < 0) throw new Error('accessibility index must be a non-negative integer');
              const element = Array.isArray(window.__dshWorkbenchAxElements) ? window.__dshWorkbenchAxElements[index] : null;
              if (!element || !element.isConnected || !visible(element)) throw new Error('accessibility index is stale; call getAXState() again');
              const role = roleFor(element), rect = element.getBoundingClientRect();
              return {element, index, role: role || 'generic', name: nameFor(element), rect};
            };
            const dispatchInput = element => { element.dispatchEvent(new Event('input', {bubbles:true, composed:true})); element.dispatchEvent(new Event('change', {bubbles:true, composed:true})); };
            const setValue = (element, value, replace) => {
              element.focus?.();
              if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                const previous = String(element.value ?? ''), start = replace || typeof element.selectionStart !== 'number' ? 0 : element.selectionStart, end = replace || typeof element.selectionEnd !== 'number' ? previous.length : element.selectionEnd;
                const next = replace ? String(value) : previous.slice(0, start) + String(value) + previous.slice(end);
                const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
                if (descriptor?.set) descriptor.set.call(element, next); else element.value = next;
                try { const cursor = replace ? next.length : start + String(value).length; element.setSelectionRange?.(cursor, cursor); } catch {}
                dispatchInput(element); return next;
              }
              if (element.isContentEditable) { if (replace) element.textContent = String(value); else element.textContent = String(element.textContent || '') + String(value); dispatchInput(element); return element.textContent; }
              throw new Error('selected accessibility node is not editable');
            };
            const point = args.point;
            const pointTarget = point ? document.elementFromPoint(point.x, point.y) : null;
            const target = pointTarget || (args.index === undefined ? document.activeElement : findIndex(args.index).element);
            if (operation === 'resolve-point' || operation === 'focus-target') {
              if (!target) throw new Error('no accessibility node or point target');
              target.scrollIntoView?.({block:'center'});
              target.focus?.();
              const rect = target.getBoundingClientRect();
              return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2, width:rect.width, height:rect.height, index:args.index};
            }
            if (operation === 'snapshot' || operation === 'snapshot-and-screenshot') return snapshot(args.maxNodes);
            if (operation === 'click') {
              const matches = document.querySelectorAll(args.selector);
              if (matches.length !== 1) throw new Error('选择器必须唯一命中元素，当前命中 ' + matches.length + ' 个');
              const element = matches[0]; element.scrollIntoView({block:'center'}); element.focus?.();
              if (args.mouseButton === 'right') element.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, button:2})); else for (let count = 0; count < (args.clickCount || 1); count += 1) element.click();
              return {clicked:args.selector, clickCount:args.clickCount || 1};
            }
            if (operation === 'fill') {
              const matches = document.querySelectorAll(args.selector);
              if (matches.length !== 1) throw new Error('选择器必须唯一命中元素，当前命中 ' + matches.length + ' 个');
              const element = matches[0]; setValue(element, args.text, true); return {filled:args.selector};
            }
            if (operation === 'click-index') {
              if (!target) throw new Error('no accessibility node or point target');
              target.scrollIntoView?.({block:'center'}); target.focus?.();
              if (args.mouseButton === 'right') target.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, button:2})); else for (let count = 0; count < (args.clickCount || 1); count += 1) target.click?.();
              return {clicked: args.index, point: point || undefined, name: nameFor(target)};
            }
            if (operation === 'input-index') { const item = findIndex(args.index); setValue(item.element, args.text, true); return {index:args.index, value:args.text}; }
            if (operation === 'type-text' || operation === 'paste') { if (!target) throw new Error('no editable accessibility node'); const value = setValue(target, args.text, false); return {index:args.index, value}; }
            if (operation === 'press-key') {
              if (!target) throw new Error('no accessibility node or focused target');
              const pieces = String(args.key).split('+').map(value => value.trim()).filter(Boolean), rawKey = pieces.pop() || '';
              const aliases = {return:'Enter',esc:'Escape',space:' ',spacebar:' ',left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',del:'Delete',cmd:'Meta',command:'Meta',super:'Meta',ctrl:'Control',control:'Control',opt:'Alt',option:'Alt'};
              const key = aliases[rawKey.toLowerCase()] || rawKey;
              const modifierNames = new Set([...(args.modifiers || []), ...pieces].map(value => value.toLowerCase()));
              const options = {key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, bubbles:true, cancelable:true, ctrlKey:modifierNames.has('ctrl') || modifierNames.has('control'), metaKey:modifierNames.has('meta') || modifierNames.has('cmd') || modifierNames.has('command') || modifierNames.has('super'), altKey:modifierNames.has('alt') || modifierNames.has('opt') || modifierNames.has('option'), shiftKey:modifierNames.has('shift')};
              target.focus?.(); target.dispatchEvent(new KeyboardEvent('keydown', options));
              if (key === 'Enter' && target.form?.requestSubmit) target.form.requestSubmit();
              if ((options.ctrlKey || options.metaKey) && key.toLowerCase() === 'a' && typeof target.select === 'function') target.select();
              target.dispatchEvent(new KeyboardEvent('keyup', options)); return {index:args.index, key};
            }
            if (operation === 'select-text') {
              const element = findIndex(args.index).element;
              if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                const value = String(element.value || ''), text = args.text === undefined ? value : String(args.text), start = args.text === undefined ? 0 : Math.max(0, value.indexOf(text));
                element.focus(); element.setSelectionRange(start, start + text.length);
              } else {
                const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
              }
              return {index:args.index, text:window.getSelection()?.toString() || ''};
            }
            if (operation === 'drag') {
              const source = args.index === undefined ? null : findIndex(args.index).element;
              const rect = source?.getBoundingClientRect?.();
              const from = args.from || (rect ? {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2} : null);
              const to = args.to;
              if (!from || !to) throw new Error('drag requires from and to points, or an accessibility index plus to');
              const destination = document.elementFromPoint(to.x, to.y) || document.body;
              const eventOptions = point => ({bubbles:true, clientX:point.x, clientY:point.y, buttons:1});
              (source || document.elementFromPoint(from.x, from.y) || document.body).dispatchEvent(new MouseEvent('mousedown', eventOptions(from)));
              destination.dispatchEvent(new MouseEvent('mousemove', eventOptions(to)));
              destination.dispatchEvent(new MouseEvent('mouseup', eventOptions(to)));
              return {from, to, index:args.index};
            }
            if (operation === 'scroll') {
              const delta = Math.max(1, Number(args.amount || 1)) * Math.max(120, Math.floor(innerHeight * 0.75));
              const sign = args.direction === 'up' || args.direction === 'left' ? -1 : 1;
              if (args.index !== undefined) {
                const element = findIndex(args.index).element;
                element.scrollIntoView({block: sign < 0 ? 'start' : 'end', behavior:'auto'});
              } else if (args.direction === 'left' || args.direction === 'right') window.scrollBy({left: sign * delta, behavior:'auto'});
              else window.scrollBy({top: sign * delta, behavior:'auto'});
              return {direction:args.direction, amount:args.amount || 1};
            }
            if (operation === 'secondary-action') {
              const element = findIndex(args.index).element, action = String(args.action).toLowerCase(); element.focus?.();
              if (action === 'axpress' || action === 'press' || action === 'click') element.click?.();
              else if (action === 'axshowmenu' || action === 'showmenu' || action === 'contextmenu') element.dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, button:2}));
              else if (action === 'axincrement' || action === 'increment' || action === 'axdecrement' || action === 'decrement') { const amount = action.includes('decrement') ? -1 : 1; const current = Number(element.value); if (!Number.isNaN(current)) { element.value = String(current + amount); dispatchInput(element); } }
              else throw new Error('unsupported accessibility action: ' + args.action);
              return {index:args.index, action:args.action};
            }
            throw new Error('不支持的网页动作');
          }
          const view = viewRef.current;
          const needsNativeInput = operation === 'click-index' || operation === 'drag' || operation === 'scroll' || operation === 'press-key' || operation === 'type-text' || operation === 'paste';
          if (needsNativeInput && typeof view?.sendInputEvent !== 'function') throw new Error('当前桌面版本不支持 webview 原生输入事件');
          if (typeof view?.sendInputEvent === 'function' && needsNativeInput) {
            const resolve = async extra => await view.executeJavaScript(`(${pageAction.toString()})('resolve-point',${JSON.stringify(extra)})`);
            const button = args.mouseButton === 'right' ? 'right' : args.mouseButton === 'middle' ? 'middle' : 'left';
            if (operation === 'click-index') {
              const resolved = await resolve(args);
              view.sendInputEvent({type:'mouseMove', x:resolved.x, y:resolved.y});
              const clickCount = Math.max(1, Math.min(3, Number(args.clickCount) || 1));
              view.sendInputEvent({type:'mouseDown', x:resolved.x, y:resolved.y, button, clickCount});
              view.sendInputEvent({type:'mouseUp', x:resolved.x, y:resolved.y, button, clickCount});
              return {clicked:args.index, point:{x:resolved.x, y:resolved.y}, inputEvent:true};
            }
            if (operation === 'drag') {
              const from = args.from || await resolve(args);
              const to = args.to;
              if (!to) throw new Error('drag requires a destination point');
              view.sendInputEvent({type:'mouseMove', x:from.x, y:from.y});
              view.sendInputEvent({type:'mouseDown', x:from.x, y:from.y, button:'left'});
              view.sendInputEvent({type:'mouseMove', x:to.x, y:to.y});
              view.sendInputEvent({type:'mouseUp', x:to.x, y:to.y, button:'left'});
              return {from, to, inputEvent:true};
            }
            if (operation === 'scroll') {
              const resolved = args.point ? {x:args.point.x, y:args.point.y} : await resolve(args);
              const amount = Math.max(1, Number(args.amount || 1)) * 600;
              const deltaX = args.direction === 'left' ? -amount : args.direction === 'right' ? amount : 0;
              const deltaY = args.direction === 'up' ? -amount : args.direction === 'down' ? amount : 0;
              view.sendInputEvent({type:'mouseWheel', x:resolved.x, y:resolved.y, deltaX, deltaY, canPreventDefault:true});
              return {direction:args.direction, amount:args.amount || 1, inputEvent:true};
            }
            if (operation === 'type-text' || operation === 'paste') {
              await view.executeJavaScript(`(${pageAction.toString()})('focus-target',${JSON.stringify(args)})`);
              for (const character of String(args.text || '')) view.sendInputEvent({type:'char', keyCode:character});
              return {index:args.index, value:args.text, inputEvent:true};
            }
            if (operation === 'press-key') {
              await view.executeJavaScript(`(${pageAction.toString()})('focus-target',${JSON.stringify(args)})`);
              const pieces = String(args.key).split('+').map(value => value.trim()).filter(Boolean);
              const rawKey = pieces.pop() || '';
              const aliases = {return:'Enter',esc:'Escape',escape:'Escape',space:' ',spacebar:' ',left:'Left',right:'Right',up:'Up',down:'Down',arrowleft:'Left',arrowright:'Right',arrowup:'Up',arrowdown:'Down',del:'Delete',backspace:'Backspace',cmd:'Meta',command:'Meta',super:'Meta',ctrl:'Control',control:'Control',opt:'Alt',option:'Alt'};
              const key = aliases[rawKey.toLowerCase()] || rawKey;
              const modifiers = [...(args.modifiers || []), ...pieces].map(value => value.toLowerCase()).filter(value => ['shift','ctrl','control','alt','option','opt','meta','cmd','command','super'].includes(value)).map(value => value === 'ctrl' ? 'control' : value === 'option' || value === 'opt' ? 'alt' : value === 'command' || value === 'cmd' || value === 'super' ? 'meta' : value);
              view.sendInputEvent({type:'keyDown', keyCode:key, modifiers});
              if (key.length === 1 && !modifiers.includes('control') && !modifiers.includes('meta') && !modifiers.includes('alt')) view.sendInputEvent({type:'char', keyCode:key, modifiers});
              view.sendInputEvent({type:'keyUp', keyCode:key, modifiers});
              return {index:args.index, key, inputEvent:true};
            }
          }
          if (operation === 'snapshot-and-screenshot') {
            const state = await viewRef.current.executeJavaScript(`(${pageAction.toString()})('snapshot',${JSON.stringify(args)})`);
            return {state, screenshot: await captureScreenshot(args)};
          }
          return await viewRef.current.executeJavaScript(`(${pageAction.toString()})(${JSON.stringify(operation)},${JSON.stringify(args)})`);
        };
        browserHandlers.set(handlerKey, execute);
        return () => {if (browserHandlers.get(handlerKey) === execute) browserHandlers.delete(handlerKey);};
      }, [handlerKey]);
      React.useEffect(() => {
        const view = viewRef.current;
        if (!view || !url) return;
        setReady(false);
        let disposed = false;
        const supportTimer = setTimeout(() => {
          if (!disposed && typeof view.getURL !== 'function') setUnsupported(true);
        }, 800);
        const navigation = () => {
          if (disposed) return;
          try {
            const actual = view.getURL(); setAddress(actual); setBack(view.canGoBack()); setForward(view.canGoForward());
            if (/^https?:/.test(actual)) localStorage.setItem('dwb:url:' + preferenceKey, actual);
          } catch {}
        };
        const events = {
          'dom-ready': () => {setReady(true); navigation();},
          'did-start-loading': () => {setLoading(true); setError('');},
          'did-stop-loading': () => {setLoading(false); navigation();},
          'did-navigate': () => {setPicked(null); setPicking(false); navigation();},
          'did-navigate-in-page': navigation,
          'page-title-updated': e => setTitle(e.title),
          'did-fail-load': e => {if (e.errorCode !== -3 && e.isMainFrame !== false) {setError(`无法打开网页：${e.errorDescription}（${e.errorCode}）`); setLoading(false);}},
          'console-message': e => addLog(e.message, ['debug', 'info', 'warning', 'error'][e.level] || String(e.level)),
          'render-process-gone': () => {setReady(false); setError('网页进程已退出，请重新加载');}
        };
        Object.entries(events).forEach(([name, listener]) => view.addEventListener(name, listener));
        return () => {disposed = true; clearTimeout(supportTimer);Object.entries(events).forEach(([name, listener]) => view.removeEventListener(name, listener));};
      }, [url, preferenceKey, addLog]);
      React.useEffect(() => {
        if ((!picking && (!picked || picked.captureMode === 'selection')) || !ready) return;
        let disposed = false, pending = false;
        const timer = setInterval(async () => {
          if (pending || disposed) return; pending = true;
          try {
            const result = await viewRef.current.executeJavaScript('(() => { const p = window.__dshWorkbenchPick; window.__dshWorkbenchPick = null; return {pick:p,active:window.__dshWorkbenchPickerActive}; })()');
            if (!disposed && result.pick) {setPicked(result.pick); setComment(''); setPicking(false);}
            else if (!disposed && !result.active) {setPicking(false);setPicked(null);}
          } catch { if (!disposed) setPicking(false); } finally {pending = false;}
        }, 160);
        return () => { disposed = true; clearInterval(timer); };
      }, [picking, picked, ready]);
      React.useEffect(() => {if (picked) commentRef.current?.focus();}, [picked]);
      React.useEffect(() => {
        if (!ready || !viewRef.current) return;
        const marks = notes.map((note, index) => ({url: note.url, selector: note.selector, label: index + 1})).filter(n => n.selector && n.url === address);
        function renderMarks(marks) {
          window.__dshWorkbenchClearMarks?.();
          const layer = document.createElement('div'); layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645';
          const items = [];
          for (const mark of marks) {
            let target; try {target = document.querySelector(mark.selector);} catch {continue;}
            if (!target) continue;
            const badge = document.createElement('span'); badge.textContent = String(mark.label);
            badge.style.cssText = 'position:fixed;display:grid;place-items:center;box-sizing:border-box;border:2px solid white;border-radius:12px;width:24px;height:24px;background:#5685e9;color:white;font:600 11px system-ui;box-shadow:0 1px 5px #0002';
            layer.appendChild(badge); items.push({target,badge});
          }
          const position = () => items.forEach(({target,badge}) => {
            const rect = target.getBoundingClientRect(); badge.style.display = target.isConnected && rect.width && rect.bottom > 0 && rect.top < innerHeight ? 'grid' : 'none';
            badge.style.left = Math.max(0, Math.min(innerWidth - 26, rect.right - 12)) + 'px'; badge.style.top = Math.max(0, rect.top - 12) + 'px';
          });
          document.documentElement.appendChild(layer); position();
          window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
          window.__dshWorkbenchClearMarks = () => {layer.remove();window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);};
        }
        void viewRef.current.executeJavaScript(`(${renderMarks.toString()})(${JSON.stringify(marks)}); true`).catch(() => {});
      }, [notes, ready, address]);
      const stopPick = async () => {
        await run('window.__dshWorkbenchPicker?.stop(); true');
        setPicking(false);
      };
      const cancelPick = attempt(async () => {await stopPick();setPicked(null);});
      const beginPick = async () => {
        await stopPick(); setPicked(null);
        await run(`(${installPicker.toString()})(${readElementSource.toString()}); true`); setPicking(true);
      };
      const togglePick = attempt(async () => {
        if (picking || picked) {await cancelPick();return;}
        await beginPick();
      });
      const savingRef = React.useRef(false);
      const save = async (again) => {
        if (savingRef.current || !picked) return;
        savingRef.current = true;
        try {
          await stopPick();
          addNote({...picked, kind: 'element', comment, sessionId: id}); setPicked(null); setComment('');
          if (again) await beginPick();
        } catch (err) { setError(err.message); }
        finally {savingRef.current = false;}
      };
      React.useEffect(() => {
        const view = viewRef.current;
        return () => {if (view?.executeJavaScript) void view.executeJavaScript('window.__dshWorkbenchPicker?.stop(); true').catch(() => {});};
      }, []);
      const selectText = attempt(async () => {
        const data = await run(`(() => {
          const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null;
          const common = s.getRangeAt(0).commonAncestorContainer;
          const n = common.nodeType === 1 ? common : common.parentElement;
          return {captureMode:'selection', text:s.toString().slice(0,8000), selection:s.toString().slice(0,8000),
            url:location.href,title:document.title,tag:n?.tagName?.toLowerCase(),
            selector:n?.id ? '#'+CSS.escape(n.id) : n?.tagName?.toLowerCase(),
            source:(${readElementSource.toString()})(n)};
        })()`);
        if (!data) throw new Error('请先在网页里划选一段文字，再点“注释选区”');
        setPicked(data); setComment('');
      });
      React.useEffect(() => {
        const keyboard = e => {
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a' && panelRef.current?.contains(document.activeElement)) {e.preventDefault(); void togglePick();}
          if (e.key === 'Escape' && (picking || picked)) void cancelPick();
        };
        document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard);
      });
      return h('section', {className: 'dwb-root', ref: panelRef, 'data-dsh-workbench': true},
        h('form', {className: 'dwb-bar', onSubmit: e => {e.preventDefault(); navigate(address);}},
          button('后退', attempt(() => viewRef.current.goBack()), {disabled: !back, children: '←'}),
          button('前进', attempt(() => viewRef.current.goForward()), {disabled: !forward, children: '→'}),
          button('重新加载', attempt(() => viewRef.current.reload()), {disabled: !url, children: '↻'}),
          h('input', {className: 'dwb-url', value: address, onChange: e => setAddress(e.target.value), onFocus: e => e.target.select(), placeholder: '输入网址或 localhost:3000', 'aria-label': '网页地址', spellCheck: false}),
          h('button', {type: 'submit', title: '打开网页'}, '打开')),
        h('div', {className: 'dwb-bar dwb-tools'},
          button(picking || picked ? '退出注释' : '点选注释', togglePick, {disabled: !ready, 'aria-pressed': picking || !!picked}),
          button('注释选区', selectText, {disabled: !ready || picking || !!picked, onMouseDown: e => e.preventDefault()}),
          h('span', {className: 'dwb-spacer'}),
          h('select', {'aria-label': '预览尺寸', value: viewport, onChange: e => setViewport(e.target.value), style: {background: 'transparent', color: 'inherit', border: 0, maxWidth: 95}},
            h('option', {value: 'auto'}, '自适应'), h('option', {value: '390'}, '手机 390'), h('option', {value: '768'}, '平板 768'), h('option', {value: '1440'}, '桌面 1440')),
          button('控制台', () => setConsoleOpen(!consoleOpen), {'aria-pressed': consoleOpen}),
          button('开发者工具', attempt(() => viewRef.current.openDevTools()), {disabled: !ready, children: 'DevTools'})),
        error && h('div', {className: 'dwb-error', role: 'alert'}, error),
        unsupported && h('div', {className: 'dwb-error'}, '当前是原版 DSH，仅显示普通预览。请退出后打开 ~/Applications/DSH Workbench.app，以使用点选注释和调试。'),
        picking && h('div', {className: 'dwb-status'}, '移动鼠标高亮元素，点击后写注释 · Esc 退出'),
        h('div', {className: 'dwb-stage'},
          url ? (unsupported ? h('iframe', {src:url, title:'网页预览（原版兼容模式）', style:{width:'100%',height:'100%',border:0}}) : h('webview', {ref: viewRef, src: url, partition: 'persist:dsh-workbench', style: {width: viewport === 'auto' ? '100%' : viewport + 'px'}, webpreferences: 'contextIsolation=yes,sandbox=yes,nodeIntegration=no', 'aria-label': '网页预览'})) :
            h('div', {className: 'dwb-empty'}, h('div', {style: {fontSize: 32, opacity: .5}}, '◎'), h('h3', null, '让页面和对话并排'),
              h('p', null, '打开开发中的页面，点选需要修改的地方。每条意见都会带着页面上下文加入输入框。'),
              h('p', null, '在地址栏输入网站或本地开发服务器地址')),
          picked && h('form', {className: 'dwb-comment', 'data-dsh-annotation-ui': true, onSubmit: e => {e.preventDefault(); save(false);}},
            h('strong', null, '添加注释'), h('code', {title: picked.selector}, picked.selector || picked.title),
            sourceLabel(picked) && h('code', {title: sourceLabel(picked)}, '源码：' + sourceLabel(picked)),
            h('blockquote', {className:'dwb-picked-text', 'aria-label':'正在注释的原文'}, picked.text || picked.tag || '无文字元素'),
            h('textarea', {ref: commentRef, value: comment, onChange: e => setComment(e.target.value), placeholder: '描述这里需要怎么改…', 'aria-label': '元素注释', onKeyDown: e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault(); save(e.metaKey || e.ctrlKey);}}}),
            h('footer', null, button('取消', cancelPick), button('保存并继续点选', () => save(true)), h('button', {type: 'submit', className: 'dwb-primary'}, '添加注释')))),
        consoleOpen && h('div', {className: 'dwb-console', 'data-dsh-annotation-ui': true},
          h('div', {className: 'dwb-bar'}, h('strong', null, `控制台 · ${logs.length}`), h('span', {className: 'dwb-spacer'}), button('清空日志', () => setLogs([]))),
          logs.map((log, index) => h('div', {className: 'dwb-log', key: index, 'data-level': log.level},
            h('small', {className: 'dwb-muted'}, log.at), h('span', null, log.message),
            button('引用日志', attempt(() => addNote({sessionId: id, kind: 'console', url: address, title, text: log.message, comment: '请分析这条调试日志'})), {children: '+'}))),
          h('form', {className: 'dwb-console-input', onSubmit: async e => {
            e.preventDefault(); const code = expression; if (!code.trim()) return;
            setExpression(''); addLog('› ' + code);
            try {const result = await run(code); addLog(typeof result === 'string' ? result : JSON.stringify(result) ?? String(result));} catch (err) {addLog(err.message, 'error');}
          }}, h('span', null, '›'), h('input', {value: expression, onChange: e => setExpression(e.target.value), placeholder: '在当前网页执行 JavaScript', 'aria-label': '控制台表达式', spellCheck: false}), h('button', {type: 'submit', disabled: !ready}, '执行'))),
        h('div', {className: 'dwb-status'}, loading ? '正在加载…' : `${title} · ${connection} · 注释附在输入框上方`));
    }
    function LaunchButton() {
      return h('button', {type: 'button', className: 'dwb-launch', title: '打开网页预览与注释', onClick: () => ctx.get('sidebarRight')?.openTab(KIND)}, '◧ 网页');
    }
    function apply(context) {
      ctx = context;
      ctx.effect(() => installAnnotationSend(ctx.get('conversation')));
      // Shared renderer for local preview plugins, including hot-reload handoff.
      ctx.effect(() => {
        const api = {BrowserPanel};
        window.__dshSidebarAnnotations = api;
        window.__dshWorkbenchPanels = api;
        window.dispatchEvent(new Event('dsh-workbench-panels-changed'));
        return () => {
          if (window.__dshWorkbenchPanels === api) {
            delete window.__dshWorkbenchPanels;
            if (window.__dshSidebarAnnotations === api) delete window.__dshSidebarAnnotations;
            window.dispatchEvent(new Event('dsh-workbench-panels-changed'));
          }
        };
      });
      ctx.effect(() => {
        const style = document.createElement('style'); style.textContent = CSS_TEXT; document.head.appendChild(style); return () => style.remove();
      });
      ctx.effect(() => ctx.sidebarRightTabs.register({id: KIND, kind: KIND, priority: 'extension', title: () => '右边栏注释', guide: [{order: 1, title: () => '网页预览与注释', description: () => '浏览网页、调试页面，多处意见一起加入对话'}]}));
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({name: 'sidebar.right.pane.tab', key: KIND}, BrowserPanel)));
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({name: 'conversation.input.dock', id: KIND, order: 20}, AnnotationRail)));
      ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({name: 'conversation.input.left', id: KIND, order: 25}, LaunchButton)));
      ctx.effect(() => installContextSelection({getSessionId: currentSession, onAnnotate: addNote}));
      ctx.effect(() => {
        let disposed = false, controller, previousSession = currentSession();
        const restart = () => {const next=currentSession();if(next !== previousSession){previousSession=next;controller?.abort();}};
        const unsubscribe = ctx.sessions.list.subscribe(restart);
        const poll = async () => {
          while (!disposed) {
            const sessionId = currentSession();
            if (!sessionId) {await new Promise(resolve => setTimeout(resolve, 1000)); continue;}
            controller = new AbortController();
            try {
              const response = await fetch('/dsh-workbench/bridge?sessionId='+encodeURIComponent(sessionId), {signal:controller.signal});
              if (!response.ok) throw new Error('bridge not ready');
              reportBridge('DSH 已连接');
              const {action} = await response.json();
              if (!action || disposed) continue;
              let reply = {sessionId, actionId:action.actionId, ok:true};
              try {
                if (currentSession() !== sessionId) throw new Error('会话已切换，请回到原会话重试');
                const navigation = ctx.get('sidebarRight');
                const activeKind = navigation.active()?.kind;
                const targetKind = action.panelKind || (browserHandlers.has(sessionId + ':' + activeKind) ? activeKind : KIND);
                const handlerKey = sessionId + ':' + targetKind;
                navigation.openTab(targetKind);
                const deadline = Date.now()+2500;
                while (!browserHandlers.has(handlerKey) && Date.now()<deadline) await new Promise(resolve => setTimeout(resolve,50));
                const handler = browserHandlers.get(handlerKey);
                if (!handler) throw new Error('网页工作台尚未打开');
                reply.result = await handler(action);
                if (JSON.stringify(reply).length > 8 * 1024 * 1024) throw new Error('返回内容过长，请缩小查询范围');
              } catch (err) {reply = {sessionId, actionId:action.actionId, ok:false,error:String(err.message || err).slice(0,2000)};}
              await fetch('/dsh-workbench/bridge', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(reply)});
            } catch (err) { if (!disposed && err.name !== 'AbortError') {reportBridge('DSH 工具未连接');await new Promise(resolve => setTimeout(resolve,1500));} }
          }
        };
        void poll(); return () => {disposed = true;controller?.abort();unsubscribe();};
      });
    }
    return {apply, inject: ['slots', 'sidebarRightTabs', 'sessions', 'conversation']};
  }
});
