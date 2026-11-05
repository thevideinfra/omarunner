# Changelog

## 0.4.0

Tested on Omarchy 4.5.0-3 with Hyprland 0.56.2.

### Fixed

- Files, folders, calculator, windows, clipboard and web results never showed on Omarchy 4.5. Arrays stored in a QML property now reach JavaScript as array-likes that fail `Array.isArray()`, so every search source was dropped silently. The models now recognise lists by shape.
- `SUPER + ALT + SPACE` opened Omarchy's own dock apps layout instead of the omarunner app list. Omarchy 4.5 gives the Apps menu row an action as well as a provider, and omarunner treated any row with an action as a leaf. A row with a provider is a menu again.

### Added

- The Apps page lists your pinned apps first, under a Favorites heading with a divider before the other applications. Searching there still finds apps only, and `Ctrl+P` pins or unpins.
- The Favorites settings page shows its reorder keys (`Ctrl+Up/Down`) in the input line.

### Changed

- The Apps page keeps the category column while you type and captions its rows "Applications", like a root search.
- With the Center position (the default), the input line sits at the same spot on every page, so the Apps page opens where the root does. When Favorites or Recent launches are showing at the root, the card now opens a little lower than before and grows downward.

## 0.3.0 and earlier

See the git history.
