# Integrating a local preview tab

`dsh-sidebar-annotations` owns the generic browser panel and annotation
attachment. A local preview plugin can keep its own preview URL and tab id,
then reuse that panel instead of implementing a second picker or composer
integration.

## Public handoff

After the annotation plugin loads, the DSH renderer exposes:

```js
window.__dshWorkbenchPanels = {
  BrowserPanel
}
```

The object is also available as `window.__dshSidebarAnnotations`. The latter
is kept as a descriptive alias for integrations that do not want to depend on
the historical workbench name. Both names are removed when the plugin is
unloaded. A preview plugin should listen for
`dsh-workbench-panels-changed`, because the annotation plugin may be hot
reloaded after the preview plugin has already mounted.

## React adapter

The following is the smallest useful adapter. It waits for the shared panel,
then renders it with a preview-specific `panelKind` and `defaultUrl`:

```js
const h = React.createElement;

function SharedPreviewPanel({sessionId}) {
  const [Panel, setPanel] = React.useState(
    () => window.__dshWorkbenchPanels?.BrowserPanel || null,
  );

  React.useEffect(() => {
    const refresh = () => setPanel(
      () => window.__dshWorkbenchPanels?.BrowserPanel || null,
    );
    window.addEventListener('dsh-workbench-panels-changed', refresh);
    refresh();
    return () => window.removeEventListener(
      'dsh-workbench-panels-changed', refresh,
    );
  }, []);

  if (!Panel) {
    return h('div', null, '请先加载 DSH 右边栏注释插件');
  }
  return h(Panel, {
    sessionId,
    panelKind: 'my-preview',
    defaultUrl: 'http://127.0.0.1:4173/',
  });
}
```

`panelKind` must be stable and unique to the preview plugin. It is used to
separate URL preferences and model-side browser actions. `defaultUrl` is
applied when the preview tab is opened or receives a new default route.

## Source locations

The panel reads optional source metadata from the selected DOM element. A
preview renderer can attach it when it maps a source template to output DOM:

```js
element.dataset.dshSourceFile = '/workspace/miniprogram/pages/home/home.wxml';
element.dataset.dshSourceLine = '48';
```

The annotation contains this as a source hint, for example:

```text
源码（WXML）：/workspace/miniprogram/pages/home/home.wxml:48
```

This is a source-template location. The integration must not claim that it is
the JavaScript handler or the business logic that produced the element.

## Lifecycle rules

- Keep `panelKind` stable across hot reloads and across renders.
- Let `BrowserPanel` own the `<webview>`, picker lifecycle, console, and
  `sidebar_browser` handler. Do not attach a second pointer overlay to the
  same page.
- Use a unique tab id / kind for the preview plugin and register it through
  the DSH sidebar tab service.
- Do not copy or patch the annotation plugin's private `lib/client.js`; the
  `window.__dshWorkbenchPanels` handoff is the compatibility boundary.
- If the shared panel is absent, show a useful fallback or the preview's
  ordinary view. Do not crash the whole profile.

## Message and security boundary

The panel sends annotations through the current DSH conversation input. The
preview plugin should pass the current session id when it has one and should
not copy page text into a new prompt by itself. Page text, attributes, source
paths, and URLs are untrusted data and must be treated as quoted context.
