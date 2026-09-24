import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "ClipboardModel.js" as ClipboardModel

// "cb": Omarchy's clipboard history, newest first; "cb git" filters text,
// "cb screenshot" lists images, "cb list" opens the clipboard manager. Enter
// pastes into the previous window, Shift+Enter copies only.
Item {
  id: root
  property string sourceId: "clipboard"
  property string groupLabel: "Clipboard"
  property int maxRows: 8
  property bool enabled: true
  property var history: []
  signal results(int serial, var rows)

  function claims(query) { return ClipboardModel.claims(query) }

  // "cb list" offers the clipboard manager; everything else lists history.
  function search(query, serial) {
    if (ClipboardModel.isListCommand(query)) { root.results(serial, [ClipboardModel.listRow()]); return }
    var hits = ClipboardModel.matches(root.history, ClipboardModel.filter(query))
    root.results(serial, hits.slice(0, root.maxRows).map(ClipboardModel.row))
  }

  function activate(value, modifiers) {
    var argv = ClipboardModel.activateArgv(root.history, value, (modifiers & Qt.ShiftModifier) !== 0)
    if (argv.length) Util.execArgv(argv)
  }

  FileView {
    path: Quickshell.env("HOME") + "/.local/state/omarchy/clipboard-history.json"
    watchChanges: true
    printErrors: false
    onLoaded: root.history = ClipboardModel.parseHistory(text())
    onFileChanged: reload()
    onLoadFailed: root.history = []
  }
}
