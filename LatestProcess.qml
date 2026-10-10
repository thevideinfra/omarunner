import Quickshell
import Quickshell.Io
import QtQuick

// One process at a time, latest request wins. A killed run still delivers
// onExited, possibly after the next request arrived, so a request while a run
// is live only records itself; onExited then starts it. `finished` therefore
// always names the run that actually exited.
Item {
  id: root
  signal finished(int serial, string query, int exitCode, string output)

  property var pendingArgs: null
  property int pendingSerial: 0
  property string pendingQuery: ""
  property string pendingInput: ""

  // `input`, when given, is written to the process's stdin once it starts. Use
  // it for anything private (file names): arguments are readable by other
  // local users in /proc while the process runs, stdin is not.
  function run(args, serial, query, input) {
    if (proc.running) {
      root.pendingArgs = args
      root.pendingSerial = serial
      root.pendingQuery = query
      root.pendingInput = input || ""
      proc.running = false
      return
    }
    root.start(args, serial, query, input || "")
  }

  function start(args, serial, query, input) {
    proc.serial = serial
    proc.query = query
    proc.input = input || ""
    proc.stdinEnabled = proc.input !== ""
    proc.collected = ""
    proc.command = args
    proc.running = true
  }

  function cancel() {
    root.pendingArgs = null
    proc.running = false
  }

  Process {
    id: proc
    property int serial: 0
    property string query: ""
    property string input: ""
    property string collected: ""
    onStarted: if (proc.input !== "") proc.write(proc.input)
    stdout: SplitParser { onRead: function(data) { proc.collected += data + "\n" } }
    onExited: function(exitCode) {
      root.finished(proc.serial, proc.query, exitCode, proc.collected)
      if (root.pendingArgs) {
        var args = root.pendingArgs
        root.pendingArgs = null
        root.start(args, root.pendingSerial, root.pendingQuery, root.pendingInput)
      }
    }
  }
}
