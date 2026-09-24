import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "RecentModel.js" as RecentModel
import "FileModel.js" as FileModel

// Recently used files from recently-used.xbel, parsed once per file change.
Item {
  id: root
  property string sourceId: "recent"
  property string groupLabel: "Recent"
  property int maxRows: 5
  property bool enabled: true
  property string home: Quickshell.env("HOME")
  property var entries: []
  property bool fuzzy: false
  signal results(int serial, var rows)

  function search(query, serial) {
    var paths = RecentModel.matches(root.entries, query, root.fuzzy)
    var rows = []
    for (var i = 0; i < paths.length && i < root.maxRows; i++) {
      var row = FileModel.fileRow(paths[i], root.home)
      row.itemId = "recent." + paths[i]
      row.sourceId = "recent"
      rows.push(row)
    }
    root.results(serial, rows)
  }

  function activate(value, modifiers) {
    var command = (modifiers & Qt.ShiftModifier) ? FileModel.revealCommand(value) : FileModel.openCommand(value)
    if (command) Util.execDetached(command)
  }

  FileView {
    path: root.home + "/.local/share/recently-used.xbel"
    watchChanges: true
    printErrors: false
    onLoaded: root.entries = RecentModel.parseXbel(text())
    onFileChanged: reload()
    onLoadFailed: root.entries = []
  }
}
