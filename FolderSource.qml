import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "FolderModel.js" as FolderModel

// Folders by name, forgiving of case and typos: "docmuents" finds
// ~/Documents, "etc" finds /etc. The folder list is read at startup and
// re-read in the background when a search finds it over a minute old.
Item {
  id: root
  property string sourceId: "folders"
  property string groupLabel: "Folders"
  property string hint: "Folders by name, typos forgiven: docs, etc"
  property int maxRows: 4
  property bool enabled: true
  property bool fuzzy: false
  property string home: Quickshell.env("HOME")
  property var folders: []
  property double listedAt: 0
  signal results(int serial, var rows)

  function search(query, serial) {
    if (Date.now() - root.listedAt > 60000 && !lister.running) lister.running = true
    var hits = FolderModel.matches(root.folders, query, root.fuzzy)
    var rows = []
    for (var i = 0; i < hits.length && i < root.maxRows; i++) rows.push(FolderModel.row(hits[i], root.home))
    root.results(serial, rows)
  }

  // Enter opens the folder; Shift+Enter opens a terminal in it.
  function activate(value, modifiers) {
    var argv = (modifiers & Qt.ShiftModifier) ? FolderModel.terminalArgv(value) : FolderModel.openArgv(value)
    if (argv.length) Util.execArgv(argv)
  }

  Process {
    id: lister
    property string collected: ""
    command: FolderModel.listArgs()
    running: true
    onRunningChanged: if (running) collected = ""
    stdout: SplitParser { onRead: function(data) { lister.collected += data + "\n" } }
    onExited: function(exitCode) {
      root.folders = FolderModel.parseList(lister.collected)
      root.listedAt = Date.now()
    }
  }
}
