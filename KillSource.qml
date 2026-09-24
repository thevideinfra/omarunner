import Quickshell
import QtQuick
import qs.Commons
import "KillModel.js" as KillModel

// "kill name": the user's matching processes. Enter sends SIGTERM,
// Shift+Enter SIGKILL.
Item {
  id: root
  property string sourceId: "kill"
  property string groupLabel: "Kill"
  property int maxRows: 8
  property bool enabled: true
  signal results(int serial, var rows)

  function claims(query) { return KillModel.claims(query) }

  function search(query, serial) {
    var filter = KillModel.filter(query)
    if (!filter) { psRunner.cancel(); root.results(serial, []); return }
    psRunner.run(KillModel.psArgs(), serial, filter)
  }

  function cancel() { psRunner.cancel() }

  function activate(value, modifiers) {
    var argv = KillModel.killArgv(value, (modifiers & Qt.ShiftModifier) !== 0)
    if (argv.length) Util.execArgv(argv)
  }

  LatestProcess {
    id: psRunner
    onFinished: function(serial, filter, exitCode, output) {
      var hits = exitCode === 0 ? KillModel.matches(KillModel.parsePs(output), filter) : []
      root.results(serial, hits.map(KillModel.row))
    }
  }
}
