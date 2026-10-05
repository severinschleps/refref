# RefRef

Always-on-top reference board for macOS, Windows and Linux. Freeform, circular pile and quickdraw slideshow views.

## Run

Needs Node 20+.

```
git clone https://github.com/severinschleps/refref.git
cd refref
npm install
npm start
```

If `npm start` fails with `Cannot find module 'electron'`, run `unset ELECTRON_RUN_AS_NODE` (set by some editor terminals) and try again.

## Build an installer

```
npm run dist
```

Output lands in `dist/`. Builds for the OS you run it on: `.dmg` on macOS, `.exe` on Windows, AppImage on Linux.

## Controls

| Action | Input |
|---|---|
| Add images | drag & drop (files or from a browser), Ctrl/⌘+V, right-click → Add images |
| Pan / zoom | drag empty space / mouse wheel |
| Select box | Shift + drag on empty space |
| Scale | blue handle on the selection |
| Views | 1 Free · 2 Pile · 3 Slides |
| Slideshow | click right/left half · ←/→ · A auto · Space pause · Esc back |
| Flip / grayscale | H / G |
| Always on top / transparent backdrop | P / T |
| Undo / redo | Ctrl/⌘+Z / Ctrl/⌘+Shift+Z |
| Save / open board | Ctrl/⌘+S / Ctrl/⌘+O |

Everything else is in the right-click menu.
