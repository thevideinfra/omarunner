import QtQuick
import Quickshell.Io
import qs.Commons

// The colour omarunner highlights with. By default the theme's own accent; or
// one of the other colours in the current theme's palette (blue, cyan, green,
// ...), read from the theme's colors.toml, or a typed #rrggbb. A palette choice
// is stored by name, so it follows a theme change, and falls back to the
// theme accent where the new theme has no such colour. Same idea as Tandem's
// and omaudiopanel's accent pickers.
Item {
  id: root

  // "theme", a palette name, or "#rrggbb".
  property string choice: "theme"
  property var palette: ({})

  readonly property color value: root.colorOf(root.choice)

  function colorOf(name) {
    var text = String(name || "")
    if (/^#[0-9a-fA-F]{6}$/.test(text)) return text
    if (text !== "theme" && root.palette[text] !== undefined) return root.palette[text]
    return Color.accent
  }

  function parse(text) {
    var next = {}
    var lines = String(text).split("\n")
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6})"/)
      if (m) next[m[1]] = m[2]
    }
    root.palette = next
  }

  FileView {
    id: colors
    path: Color.currentThemePath + "/colors.toml"
    watchChanges: true
    printErrors: false
    onLoaded: root.parse(text())
    onFileChanged: reload()
  }

  // A theme switch reaches the shell as a pushed payload, and the file may be
  // swapped under the watch, so also re-read shortly after the accent moves.
  Connections {
    target: Color
    function onAccentChanged() { refresh.restart() }
  }

  Timer {
    id: refresh
    interval: 400
    onTriggered: colors.reload()
  }
}
