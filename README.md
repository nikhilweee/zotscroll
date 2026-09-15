# Zotscroll

A lightweight smooth scroll plugin for Zotero 10's built-in PDF reader using vim navigation keys (`hjkl`).

## Features

- **Smooth animated scrolling**: Intercepts `h`, `j`, `k`, and `l` keys and applies physics-based easing (`requestAnimationFrame`) for fluid gliding without stutter.
- **Continuous glide on key hold**: Holding down navigation keys smoothly accelerates and accumulates movement.
- **Input safety**: Automatically ignores key presses inside search bars, notes, comments, and form fields.
- **Half-page jumping**: Supports `d` (half-page down) and `e` (half-page up).

## Keybindings (inside PDF reader)

| Key | Action |
| --- | --- |
| `j` | Smooth scroll down (hold for continuous scroll) |
| `k` | Smooth scroll up (hold for continuous scroll) |
| `h` | Smooth scroll left (hold for continuous scroll) |
| `l` | Smooth scroll right (hold for continuous scroll) |
| `d` | Smooth half-page down |
| `e` | Smooth half-page up |

## Development

Pack into an XPI:
```bash
make pack
```

Run Zotero with devtools and debugger:
```bash
make debug
```
