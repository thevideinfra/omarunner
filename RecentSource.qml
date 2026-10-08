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
  property string hint: "Recently opened files · recent"
  property int maxRows: 5
  property bool enabled: true
  // Also answers ordinary queries, not only "recent".
  property bool alsoUnprefixed: true
  property string home: Quickshell.env("HOME")
  property var entries: []
  // Parsed list before the existence check; entries is what remains of it.
  property var parsed: []
  property bool fuzzy: false
  signal results(int serial, var rows)

  function claims(query) { return RecentModel.claims(query) }

  // "recent" lists the newest files (up to 8); other queries search them.
  function search(query, serial) {
    root.maxRows = RecentModel.claims(query) ? 8 : 5
    var paths = RecentModel.forQuery(root.entries, query, root.fuzzy, root.maxRows)
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
    onLoaded: root.refresh(RecentModel.parseXbel(text()))
    onFileChanged: reload()
    onLoadFailed: root.refresh([])
  }

  // Drop entries whose file is gone: the recent list outlives deleted files.
  function refresh(list) {
    root.parsed = list
    if (list.length === 0) { root.entries = []; return }
    checker.run(RecentModel.existsArgs(list.map(function(e) { return e.path })), 0, "")
  }

  LatestProcess {
    id: checker
    onFinished: function(serial, query, exitCode, output) {
      root.entries = RecentModel.keepExisting(root.parsed, output)
    }
  }
}
