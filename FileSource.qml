import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "FileModel.js" as FileModel

// Files source: one fd (or fd | fzf) run per settled query; LatestProcess
// kills the previous run and drops its reply.
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

  // Whether the run for each serial was fzf-ranked, so its rows keep fzf's
  // order. Only the latest serials matter; older entries are dropped.
  property var rankedBySerial: ({})

  function search(query, serial) {
    var args = root.useFzf ? FileModel.fzfArgs(query, root.home) : FileModel.fdArgs(query, root.home)
    if (args.length === 0) { runner.cancel(); root.results(serial, []); return }
    var ranked = ({})
    ranked[serial] = root.useFzf
    root.rankedBySerial = ranked
    runner.run(args, serial, query)
  }

  function cancel() { runner.cancel() }

  function activate(value, modifiers) {
    var command = (modifiers & Qt.ShiftModifier) ? FileModel.revealCommand(value) : FileModel.openCommand(value)
    if (command) Util.execDetached(command)
  }

  Process {
    command: ["sh", "-c", "command -v fzf"]
    running: true
    onExited: function(exitCode) { root.fzfAvailable = exitCode === 0 }
  }

  LatestProcess {
    id: runner
    onFinished: function(serial, query, exitCode, output) {
      var ranked = root.rankedBySerial[serial] === true
      root.results(serial, exitCode === 0 ? FileModel.fileRows(output, root.home, query, ranked) : [])
    }
  }
}
