# Third-party notices

## dsh-select-to-chat

The context-selection and floating annotation interaction was adapted from
[`mewmind-chen/dsh-select-to-chat`](https://github.com/mewmind-chen/dsh-select-to-chat).
The project is distributed under the MIT License. The applicable license text
is kept in [`lib/context-selection.LICENSE`](lib/context-selection.LICENSE)
and is included with the distributed package.

The adaptation is contained in `lib/context-selection.js`. The rest of this
plugin, including the DSH sidebar, browser bridge, picker, and composer
integration, is original code in this repository.

## DSH and Electron

This plugin integrates with DSH's public Cordis, sidebar, conversation, and
tool APIs and can optionally patch an installed DSH Desktop Electron bundle.
DSH and Electron remain the property of their respective authors and are not
redistributed by this package. The optional desktop patch modifies a user's
explicitly selected local app copy; it is not included in release assets.
