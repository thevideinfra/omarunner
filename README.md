# omarunner

A KRunner-style single-line launcher for Omarchy. It replaces the Omarchy root
menu on `SUPER + SPACE`: with nothing typed it is one input line, and the first
keystroke expands it into results drawn from the whole Omarchy menu tree, the
installed applications, and files in your home directory. It is a fork of the first-party `omarchy.menu` plugin, so
it follows the active Omarchy theme with no configuration.

Current state, known gaps and next steps: `docs/STATUS.md`.

## Installation

```bash
./install.sh
omarchy-restart-shell
```

`install.sh` symlinks this checkout into `~/.config/omarchy/plugins/videinfra.omarunner`,
enables the plugin in `~/.config/omarchy/shell.json` (backing the file up first),
and symlinks the `omarunner` CLI into `~/.local/bin`.

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
id (`setup.power`) or an alias (`power`), the same routes `omarchy-menu` accepts.

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

Run the unit tests with `npm test`. They cover the pure row-building logic in
`RunnerModel.js`, the structure of `Runner.qml`, the CLI, and the uninstaller.

A symlinked plugin does not hot reload, so restart the shell after editing QML:

```bash
omarchy-restart-shell
```

`bin/omarunner-diff-upstream` compares the installed first-party menu plugin
against the vendored baseline in `upstream/`, which is how drift after an Omarchy
update becomes visible. See `docs/UPSTREAM.md`.

## Applications

Application rows come from Quickshell's `DesktopEntries`, read by `AppSource.qml`
through the pure helpers in `AppModel.js`, and filtered by the same
`default/omarchy/launcher.hides` list the Omarchy launcher uses. The shell's
shared `AppLibrary` is not reachable from a third-party menu plugin, so the
runner keeps its own source; the visible difference is that launching from
omarunner does not raise the shell's launch OSD.

## Search sources

Besides the Omarchy menu tree and installed applications, omarunner searches
live sources as you type. The first one is Files: a `fd` search over `$HOME`.
Press Enter on a file result to open it, Shift+Enter to reveal its containing
folder instead.

Each source can be toggled on or off from the Sources page: type "Sources" in
the launcher, or run `omarunner toggle sources`. The setting is stored at
`~/.config/omarchy/omarunner.json`. Hand edits to an existing file are picked
up while the shell runs; if the file is first created after the shell started,
restart the shell (or toggle a source once) for edits to be watched. A source
missing from the file counts as enabled. If the file is not valid JSON,
omarunner uses defaults and, on the next toggle, copies the broken file to
`omarunner.json.bak` before writing a fresh one.

## Relationship to omarchy.menu

The first-party `omarchy.menu` plugin stays installed and untouched. It still
serves the Omarchy logo button in the bar, the `SUPER + CTRL + SPACE` background
switcher, and the `omarchy-menu-select` / `omarchy-menu-input` dmenu helpers,
which omarunner deliberately does not implement.

## Verified on

Omarchy 4.0.4-1.
