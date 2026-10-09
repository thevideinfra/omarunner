import Quickshell
import Quickshell.Io
import QtQuick
import "HistoryModel.js" as HistoryModel

// Launch history and Favorites, kept in ~/.local/state/omarunner/history.json
// (state, not config: it changes on every launch, and omarunner.json is meant
// to be hand-edited). A missing or unreadable file is just empty lists.
Item {
  id: root
  property string dir: Quickshell.env("HOME") + "/.local/state/omarunner"
  property string path: root.dir + "/history.json"
  property var history: []
  property var favorites: []
  readonly property int maxHistory: 50

  function load(rawText) {
    var data = ({})
    try { data = JSON.parse(String(rawText || "{}")) } catch (e) { data = ({}) }
    if (!data || typeof data !== "object") data = ({})
    root.history = HistoryModel.clean(data.history, root.maxHistory)
    root.favorites = HistoryModel.clean(data.favorites, 30)
  }

  function save() {
    var text = JSON.stringify({ history: root.history, favorites: root.favorites }, null, 2) + "\n"
    if (made) file.setText(text)
    else { pending = text; mkdir.running = true }
  }

  function record(row) {
    if (!HistoryModel.recordable(row)) return
    root.history = HistoryModel.record(root.history, HistoryModel.entryFromRow(row), Date.now(), root.maxHistory)
    root.save()
  }

  function isFavorite(row) { return HistoryModel.isFavorite(root.favorites, HistoryModel.keyFor(row)) }

  // Pins or unpins a result row; returns true when it was pinnable.
  function togglePin(row) {
    if (!HistoryModel.pinnable(row)) return false
    root.favorites = HistoryModel.toggleFavorite(root.favorites, HistoryModel.entryFromRow(row))
    root.save()
    return true
  }

  function remove(key) {
    root.favorites = HistoryModel.removeFavorite(root.favorites, key)
    root.save()
  }

  function move(key, delta) {
    root.favorites = HistoryModel.moveFavorite(root.favorites, key, delta)
    root.save()
  }

  property bool made: false
  property string pending: ""

  FileView {
    id: file
    path: root.path
    printErrors: false
    onLoaded: root.load(text())
    onLoadFailed: root.load("")
  }

  Process {
    id: mkdir
    command: ["mkdir", "-p", "--", root.dir]
    onExited: function(exitCode) {
      if (exitCode !== 0) { console.warn("omarunner: could not create " + root.dir + "; history is not saved"); return }
      root.made = true
      if (root.pending) { file.setText(root.pending); root.pending = "" }
    }
  }
}
