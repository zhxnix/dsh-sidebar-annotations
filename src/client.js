window.__ModuleLoader__.load({
  id: 'dsh-sidebar-annotations',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    /* PICKER_SOURCE */
    /* CONTEXT_SOURCE */
    const CSS_TEXT = /* STYLE_SOURCE */;
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
        unsupported && h('div', {className: 'dwb-error'}, '当前桌面未启用 webview，仅显示普通预览。请使用支持 webview 的 DSH Desktop，或按插件安装说明应用桌面补丁，以启用点选与调试。'),
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
