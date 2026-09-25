# omarunner

A KRunner- and COSMIC-launcher-style runner for Omarchy. It replaces the Omarchy
root menu on `SUPER + SPACE`: with nothing typed it is one input line, and the
first keystroke expands it into results grouped by kind, with the group name in
a column on the left: applications, the whole Omarchy menu tree, session actions,
folders, files, recent files, open windows, a calculator with unit conversion,
and more. The first nine results launch with `Ctrl+1` to `Ctrl+9`.

It is a fork of the first-party `omarchy.menu` plugin, so it follows the active
Omarchy theme with no configuration.

## Requirements

- Omarchy 4 with its Lua Hyprland config (`~/.config/hypr/bindings.lua`) and the
  Omarchy shell (Quickshell). Verified on Omarchy 4.0.4-1 with Hyprland 0.56.
- Older Omarchy releases that configure Hyprland through `hyprland.conf` are not
  supported: the keybinding steps below do not apply there, and focusing a
  window from the Windows results uses Hyprland's Lua dispatcher.

## Installation

```bash
git clone https://github.com/thevideinfra/omarunner.git ~/.local/share/omarunner
cd ~/.local/share/omarunner
```

Then:

```bash
./install.sh
omarchy-restart-shell
```

`install.sh` symlinks this checkout into `~/.config/omarchy/plugins/videinfra.omarunner`,
enables the plugin in `~/.config/omarchy/shell.json` (backing the file up first),
and symlinks the `omarunner` CLI into `~/.local/bin`.

Optional packages, which `install.sh` checks for and names if missing:

- `libqalculate` (provides `qalc`): unit, currency and function support in the
  calculator. Plain arithmetic works without it.
- `fzf`: fuzzy ranking for file search. Without it, file search matches names
  literally.

```bash
sudo pacman -S libqalculate fzf
```

## Updating

The plugin is a symlink to your checkout, so updating is a pull and a shell
restart:

```bash
cd ~/.local/share/omarunner
git pull
omarchy-restart-shell
```

## Keybindings

Add these to `~/.config/hypr/bindings.lua`, then run `hyprctl reload`:

```lua
-- omarunner replaces the Omarchy root menu on SUPER+SPACE (was: Omarchy menu).
-- The bar's Omarchy logo button and SUPER+CTRL+SPACE (background switcher)
-- stay on omarchy-menu.
hl.unbind("SUPER + SPACE")
o.bind("SUPER + SPACE", "omarunner", "omarunner toggle")
hl.unbind("SUPER + ALT + SPACE")
o.bind("SUPER + ALT + SPACE", "omarunner apps", "omarunner toggle apps")
```

## Usage

```
omarunner [toggle|summon|close|refresh|ping] [route]
```

`toggle` is the default verb and `root` the default route. A route is a menu item
id (`setup.power`) or an alias (`power`), the same routes `omarchy-menu` accepts,
plus `sources` and `settings` for omarunner's own pages.

## Uninstallation

```bash
./uninstall.sh
omarchy-restart-shell
```

Then remove all four lines added above (the two `hl.unbind` lines and the two
`o.bind` lines) from `~/.config/hypr/bindings.lua` and run `hyprctl reload`.
Leaving the `hl.unbind` lines in place suppresses the Omarchy defaults for
`SUPER + SPACE` and `SUPER + ALT + SPACE` without restoring anything.

## Development

Run the unit tests with `npm test`. They cover the pure logic of every source
(`*Model.js`), row building and grouping in `RunnerModel.js`, the settings model,
the structure of the QML files, the CLI, and the installer and uninstaller.

A search source is a QML file exposing `sourceId`, `groupLabel`, `hint`,
`maxRows`, `enabled`, `search(query, serial)`, `activate(value, modifiers)` and
`signal results(int serial, var rows)`, optionally `claims(query)` (a prefix
source), `leading` (rows above the menu groups) or `fallback` (rows only when
nothing else matched). Add the instance to `root.sources` in `Runner.qml`; the
Sources page picks it up from there.

A symlinked plugin does not hot reload, so restart the shell after editing QML:

```bash
omarchy-restart-shell
```

`bin/omarunner-diff-upstream` compares the installed first-party menu plugin
against the vendored baseline in `upstream/`, which is how drift after an Omarchy
update becomes visible.

## Applications

Application rows come from Quickshell's `DesktopEntries`, read by `AppSource.qml`
through the pure helpers in `AppModel.js`, and filtered by the same
`default/omarchy/launcher.hides` list the Omarchy launcher uses. The shell's
shared `AppLibrary` is not reachable from a third-party menu plugin, so the
runner keeps its own source; the visible difference is that launching from
omarunner does not raise the shell's launch OSD.

## What you can type

Results are grouped. Calculator and Open rows sit at the top; then Omarchy,
Applications and Session, whichever holds the best match first; then Windows,
Folders, Files and Recent. A search that matches nothing offers a web search.

| Type | Example | Enter | Shift+Enter |
|---|---|---|---|
| Apps, Omarchy menu | `firefox`, `theme` | launch / open | — |
| Session | `lock`, `sleep`, `restart`, `power off` | run it | — |
| Calculator | `2+2*3`, `=2` | copy the result | copy the result |
| Unit conversion (qalc) | `10 km to mi`, `100f to c`, `5 usd in eur`, `20% of 300` | copy the result | copy the result |
| Open | `github.com/x`, `https://…`, `localhost:8080`, `~/Downloads`, `/etc` | open it | copy the URL / reveal the folder |
| Folders | `documents`, `docmuents`, `etc`, `hypr` | open the folder | terminal in the folder |
| Files | `bindlua`, `invoice pdf` | open the file | reveal its folder |
| Recent | part of a recently opened file's name | open | reveal its folder |
| Windows | part of a window title or app name | focus it | focus it |
| Command | `> htop` | run in a terminal | run in the background |
| Kill | `kill firefox` | `kill` (SIGTERM) | `kill -KILL` |
| Clipboard | `cb`, `cb git`, `cb scr` (images), `cb list` | paste into the previous window | copy only |
| Web | `dd query`, `gg query`, `yt query`, `wiki query` | open in the browser | copy the URL |

Prefixes (`cb`, `>`, `kill`, `dd`/`gg`/`yt`/`wiki` followed by a query) hand the
whole list to that one source. Clipboard history appears only behind `cb`, so
copied secrets never show in an ordinary search.

Folder names forgive case and small typos. With fuzzy matching on (the
default), letters typed in order also match: `frfox` finds Firefox, and files are
ranked by `fzf`.

## Keys

| Key | Action |
|---|---|
| `Ctrl+1` … `Ctrl+9` | launch that row (add Shift for its Shift action) |
| `Enter` / `Shift+Enter` | launch the selected row / its alternate action |
| `Up` / `Down`, `PageUp` / `PageDown` | move the selection |
| `Escape` | clear the query, then close |
| `Backspace` / `Left` on an empty query | back out of a submenu |
| `Ctrl+,` or the filter button (top left) | Sources page, press again to close |
| `Ctrl+S` or the gear (top right) | Settings page, press again to close |

Shift+click works like Shift+Enter.

## Sources and settings

The **Sources** page lists every search source with a short hint and a ✓ when
enabled; Enter toggles one. Applications, Omarchy and Session can be switched
off the same way.

The **Settings** page holds: border, category column, corner radius,
Ctrl+number hints, font, fuzzy matching, hint size, opacity, row height, rows
before scrolling, text size and width. Each choice offers presets and a
**Custom…** entry: open the setting and type a value (a number in the range the
row names, or any font name), then pick the **Use …** row.

Both pages are stored in `~/.config/omarchy/omarunner.json` (`sources`,
`settings`, and `webSearchUrl` for the fallback web search, DuckDuckGo by
default). Hand edits to an existing file are picked up while the shell runs; if
the file is first created after the shell started, restart the shell (or toggle
something once) for edits to be watched. If the file is not valid JSON,
omarunner uses defaults and, on the next change, copies the broken file to
`omarunner.json.bak` before writing a fresh one.

## Relationship to omarchy.menu

The first-party `omarchy.menu` plugin stays installed and untouched. It still
serves the Omarchy logo button in the bar, the `SUPER + CTRL + SPACE` background
switcher, and the `omarchy-menu-select` / `omarchy-menu-input` dmenu helpers,
which omarunner deliberately does not implement.

## Credits

omarunner is a fork of the `omarchy.menu` plugin from
[Omarchy](https://github.com/omacom/omarchy), MIT licensed, copyright David
Heinemeier Hansson; see `LICENSE`. The launcher design borrows from KDE's
KRunner and the COSMIC launcher.

## Verified on

Omarchy 4.0.4-1.
