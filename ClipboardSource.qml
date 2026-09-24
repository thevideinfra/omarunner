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
  property string hint: "cb · cb git · cb screenshot · cb list"
  property int maxRows: 8
  property bool enabled: true
  property var history: []
  signal results(int serial, var rows)

  function claims(query) { return ClipboardModel.claims(query) }

  function search(query, serial) {
    root.results(serial, ClipboardModel.rowsFor(root.history, query, root.maxRows))
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
