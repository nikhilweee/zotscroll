# Zotscroll

Smooth Scrolling for Zotero.

## Features

- **Smooth animated scrolling**: Intercepts `h`, `j`, `k`, and `l` keys and applies physics-based easing (`requestAnimationFrame`) for fluid gliding without stutter.
- **Continuous glide on key hold**: Holding down navigation keys smoothly accelerates and accumulates movement.
- **Input safety**: Automatically ignores key presses inside search bars, notes, comments, and form fields.
- **Customizable shortcuts**: Configure any single letter (`a`-`z`) or arrow key (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) via Zotero's Settings window.
- **Half-page jumping**: Supports half-page down and half-page up (defaults: `d` and `e`).

## Default Keybindings (inside PDF reader)

| Command | Default Key | Customizable |
| --- | --- | --- |
| Scroll Down | `j` | Any letter or Arrow key |
| Scroll Up | `k` | Any letter or Arrow key |
| Scroll Left | `h` | Any letter or Arrow key |
| Scroll Right | `l` | Any letter or Arrow key |
| Half-Page Down | `d` | Any letter or Arrow key |
| Half-Page Up | `e` | Any letter or Arrow key |

To customize, open **Zotero Settings** > **Zotscroll**, click any shortcut field, and press your desired key.

## Development

Pack into an XPI:
```bash
make pack
```

Run Zotero with devtools and debugger:
```bash
make debug
```
