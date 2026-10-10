import Quickshell
import Quickshell.Io
import QtQuick
import "HistoryModel.js" as HistoryModel

// Launch history and Favorites, kept in ~/.local/state/omarunner/history.json
// (state, not config: it changes on every launch, and omarunner.json is meant
// to be hand-edited). The directory is private (700): the file holds the
// commands of launched menu actions.
//
// Nothing is written until the file has been read, so an early launch or pin
// is merged into what is on disk rather than replacing it. A file that exists
// but does not parse is copied to history.json.bak before the first write.
Item {
  id: root
  property string dir: Quickshell.env("HOME") + "/.local/state/omarunner"
  property string path: root.dir + "/history.json"
  property var history: []
  property var favorites: []
  // Paths of file and folder entries that no longer exist (hidden, not deleted:
  // a drive may only be unmounted).
  property var missing: ({})
  readonly property int maxHistory: 50

  property bool loaded: false
  property bool unsaved: false
  property bool made: false
  property bool corrupt: false
  property bool backedUp: false

  // Entries made before the file was read stay in front of what it holds.
  function merged(early, stored, max) {
    return HistoryModel.clean((Array.isArray(early) ? early : []).concat(Array.isArray(stored) ? stored : []), max)
  }

  function load(rawText) {
    var text = String(rawText || "")
    var data = ({})
    root.corrupt = false
    if (text.trim()) {
      try { data = JSON.parse(text) } catch (e) { data = ({}); root.corrupt = true }
      if (!data || typeof data !== "object" || Array.isArray(data)) { data = ({}); root.corrupt = true }
    }
    if (root.corrupt) console.warn("omarunner: " + root.path + " is not valid JSON; it will be backed up before the next write")
    root.history = root.merged(root.history, data.history, root.maxHistory)
    root.favorites = root.merged(root.favorites, data.favorites, 30)
    root.loaded = true
    root.checkPaths()
    if (root.unsaved) root.flush()
  }

  function save() {
    root.unsaved = true
    if (root.loaded) root.flush()
  }

  // Directory first, then the backup of a broken file, then the write.
  function flush() {
    if (!root.made) { if (!mkdir.running) mkdir.running = true; return }
    if (root.corrupt && !root.backedUp) {
      if (!backup.running) { backup.command = ["cp", "-f", "--", root.path, root.path + ".bak"]; backup.running = true }
      return
    }
    root.unsaved = false
    file.setText(JSON.stringify({ history: root.history, favorites: root.favorites }, null, 2) + "\n")
    root.corrupt = false
  }

  function record(row) {
    if (!HistoryModel.recordable(row)) return
    root.history = HistoryModel.record(root.history, HistoryModel.entryFromRow(row), Date.now(), root.maxHistory)
    root.save()
  }

  function isFavorite(row) { return HistoryModel.isFavorite(root.favorites, HistoryModel.keyFor(row)) }

  // Pins or unpins a result row; true when the pins changed (false when the
  // row cannot be pinned, or the 30-pin limit is reached).
  function togglePin(row) {
    if (!HistoryModel.pinnable(row)) return false
    var next = HistoryModel.toggleFavorite(root.favorites, HistoryModel.entryFromRow(row))
    if (HistoryModel.sameKeys(next, root.favorites)) return false
    root.favorites = next
    root.save()
    return true
  }

  function remove(key) {
    root.favorites = HistoryModel.removeFavorite(root.favorites, key)
    root.save()
  }

  // True when the order changed.
  function move(key, delta) {
    var next = HistoryModel.moveFavorite(root.favorites, key, delta)
    if (HistoryModel.sameKeys(next, root.favorites, true)) return false
    root.favorites = next
    root.save()
    return true
  }

  // Looks for file and folder entries whose path is gone.
  function checkPaths() {
    var paths = HistoryModel.entryPaths(root.history.concat(root.favorites))
    if (paths.length === 0) { root.missing = ({}); return }
    checker.run(["sh", "-c", "for p in \"$@\"; do [ -e \"$p\" ] || printf '%s\\n' \"$p\"; done", "sh"].concat(paths), 0, "")
  }

  LatestProcess {
    id: checker
    onFinished: function(serial, query, exitCode, output) {
      var gone = ({})
      var lines = String(output || "").split("\n")
      for (var i = 0; i < lines.length; i++) if (lines[i]) gone[lines[i]] = true
      root.missing = gone
    }
  }

  FileView {
    id: file
    path: root.path
    atomicWrites: true
    printErrors: false
    onLoaded: root.load(text())
    onLoadFailed: root.load("")
  }

  Process {
    id: mkdir
    command: ["sh", "-c", "mkdir -p -- \"$1\" && chmod 700 -- \"$1\"", "sh", root.dir]
    onExited: function(exitCode) {
      if (exitCode !== 0) { console.warn("omarunner: could not create " + root.dir + "; history is not saved"); return }
      root.made = true
      root.flush()
    }
  }

  Process {
    id: backup
    onExited: function(exitCode) {
      if (exitCode !== 0) console.warn("omarunner: could not back up " + root.path + "; overwriting it anyway")
      root.backedUp = true
      root.flush()
    }
  }
}
