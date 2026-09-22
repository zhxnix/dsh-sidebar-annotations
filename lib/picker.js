export function readElementSource(element) {
  const owner = element?.closest?.('[data-dsh-source-file][data-dsh-source-line]');
  if (!owner) return null;
  const file = owner.getAttribute('data-dsh-source-file');
  const line = Number(owner.getAttribute('data-dsh-source-line'));
  if (!file || !Number.isInteger(line) || line < 1) return null;
  return {file, line};
}

export function installPicker(sourceReader) {
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
