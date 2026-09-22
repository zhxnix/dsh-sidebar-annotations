import {readFile, writeFile} from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const picker = (await read('lib/picker.js')).replaceAll('export function', 'function');
const context = (await read('lib/context-selection.js')).replaceAll('export function', 'function');
const source = await read('src/client.js');
await writeFile(new URL('lib/client.js', root), source.replace('/* PICKER_SOURCE */', picker).replace('/* CONTEXT_SOURCE */', context).replace('/* STYLE_SOURCE */', JSON.stringify(await read('src/style.css'))));
console.log('Built dsh-sidebar-annotations/lib/client.js');
