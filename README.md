# Shortcut Guard

Shortcut Guard is a Chrome extension that blocks site-defined keyboard shortcuts on a per-domain basis without interfering with browser or extension commands. Use it to reclaim familiar keys on sites that hijack your muscle memory.

## Features
- Block specific key presses per site while leaving browser shortcuts intact.
- Domain-aware storage powered by `chrome.storage.sync` to keep settings synced across Chrome profiles.
- Smart detection of eligible pages (HTTP/HTTPS with a real host) and automatic disabling on unsupported contexts.
- Page-level guard script that intercepts `keydown`/`keypress` listeners (including `addEventListener` and `onkeydown` assignments) before sites can react.

## Load the Extension Locally
1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the toolbar to access it quickly.

## Using Shortcut Guard
1. Open any site you want to tame.
2. Click the extension icon to open the popup.
3. Confirm the detected domain, type the key to block (e.g. `k`), and click **Add**.
4. Keys can be removed via the `×` button. Changes are saved instantly for that domain.

Notes:
- Modifiers (Ctrl/Cmd/Alt) and editable targets are left untouched so you can still type normally.
- Entering unsupported pages (chrome://, file://, etc.) will show a warning and disable editing.

## Project Structure
| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome MV3 manifest describing permissions, popup, and content script wiring. |
| `popup.html`, `popup.js`, `styles.css` | UI for viewing and managing blocked keys. |
| `content.js` | Injected on every page; syncs per-domain key sets and bridges messages to the page script. |
| `pageGuard.js` | Runs in the page context; wraps `addEventListener`/`onkeydown` to block registered keys before site code executes. |

## Packaging & Publishing
1. Ensure the repository only contains the files listed above (plus `README.md` and any desired license).
2. Create a ZIP of the folder contents (without the parent directory). On macOS/Linux:
   ```bash
   zip -r shortcut-guard.zip manifest.json popup.html popup.js styles.css content.js pageGuard.js README.md
   ```
3. Upload the ZIP to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) as a new item or update.

## License
Add your preferred license (e.g., MIT) if you plan to make the project open source.
