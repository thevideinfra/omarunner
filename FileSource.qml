import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "FileModel.js" as FileModel

// Files source: one fd process per settled query; the previous run is killed.
Item {
  id: root
  property string sourceId: "files"
  property string groupLabel: "Files"
  property string hint: "Files in your home folder by name"
  property int maxRows: 5
  property bool enabled: true
  property string home: Quickshell.env("HOME")
  // Settings → Fuzzy matching. fzf ranks the files when it is installed.
  property bool fuzzy: false
  property bool fzfAvailable: false
  readonly property bool useFzf: root.fuzzy && root.fzfAvailable
  signal results(int serial, var rows)

  // A killed run still delivers onExited, possibly after the next search was
  // requested. So a search while a run is live only records itself as pending;
  // onExited starts it. proc.serial therefore always names the run that exited.
  property var pendingArgs: null
  property bool pendingFzf: false
  property int pendingSerial: 0
  property string pendingQuery: ""

  function search(query, serial) {
    var args = root.useFzf ? FileModel.fzfArgs(query, root.home) : FileModel.fdArgs(query, root.home)
    if (args.length === 0) { root.cancel(); root.results(serial, []); return }
    if (proc.running) {
      root.pendingArgs = args
      root.pendingFzf = root.useFzf
      root.pendingSerial = serial
      root.pendingQuery = query
      proc.running = false
      return
    }
    root.start(args, serial, query, root.useFzf)
  }

  function start(args, serial, query, ranked) {
    proc.ranked = ranked
    proc.serial = serial
    proc.query = query
    proc.collected = ""
    proc.command = args
    proc.running = true
  }

  function cancel() {
    root.pendingArgs = null
    proc.running = false
  }

  function activate(value, modifiers) {
    var command = (modifiers & Qt.ShiftModifier) ? FileModel.revealCommand(value) : FileModel.openCommand(value)
    if (command) Util.execDetached(command)
  }

  Process {
    command: ["sh", "-c", "command -v fzf"]
    running: true
    onExited: function(exitCode) { root.fzfAvailable = exitCode === 0 }
  }

  Process {
    id: proc
    property int serial: 0
    property string query: ""
    property string collected: ""
    property bool ranked: false
    stdout: SplitParser { onRead: function(data) { proc.collected += data + "\n" } }
    onExited: function(exitCode) {
      root.results(proc.serial, exitCode === 0 ? FileModel.fileRows(proc.collected, root.home, proc.query, proc.ranked) : [])
      if (root.pendingArgs) {
        var args = root.pendingArgs
        root.pendingArgs = null
        root.start(args, root.pendingSerial, root.pendingQuery, root.pendingFzf)
      }
    }
  }
}
