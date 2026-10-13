# Tetris

A complete Tetris clone in plain HTML, CSS and JavaScript. No frameworks, no build step, no dependencies.

## Play

Open `index.html` in any modern browser. That's it.

## Features

- Standard 10x20 playfield with 7-bag randomizer, ghost piece, hold, and 5-piece preview
- Super Rotation System (SRS) with wall kicks
- Guideline gravity curve, 20x soft drop, hard drop, 0.5 s lock delay with move reset
- Delayed auto shift (DAS/ARR) for left/right
- Scoring: 100 / 300 / 500 / 800 x level for 1-4 lines, back-to-back Tetris bonus, +1 per soft-drop cell, +2 per hard-drop cell
- Level up every 10 lines, selectable start level (1-15)
- **Hall of Fame with unlimited entries**: every game can be saved. Stored in `localStorage`, rendered with a virtualized list so it stays smooth with any number of scores. Search by name, jump with `#rank`, sort by score / lines / level / date / name, export & import as JSON, live rank while you play
- Touch controls on phones and tablets

## Controls

| Key | Action |
| --- | --- |
| Left / Right | Move |
| Down | Soft drop |
| Space | Hard drop |
| Up, X | Rotate clockwise |
| Z, Y, Ctrl | Rotate counter-clockwise |
| C, Shift | Hold |
| P, Esc | Pause |
| Enter | Start |

## Files

- `index.html` - markup
- `style.css` - styling
- `tetris.js` - game engine, rendering, input
- `hof.js` - Hall of Fame storage and list
