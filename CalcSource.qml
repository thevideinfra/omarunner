import Quickshell
import QtQuick
import qs.Commons
import "CalcModel.js" as CalcModel

// Calculator: arithmetic answers synchronously; units, currency and functions
// go to qalc. Leading, so the answer sits above the menu rows.
Item {
  id: root
  property string sourceId: "calc"
  property string groupLabel: "Calculator"
  property int maxRows: 1
  property bool enabled: true
  property bool leading: true
  signal results(int serial, var rows)

  function search(query, serial) {
    if (CalcModel.isArithmetic(query)) {
      runner.cancel()
      var value = CalcModel.format(CalcModel.evaluate(query.replace(/^\s*=/, "")))
      root.results(serial, value ? [CalcModel.row(value, query)] : [])
    } else if (CalcModel.wantsQalc(query)) {
      runner.run(CalcModel.qalcArgs(query), serial, query)
    } else {
      runner.cancel()
      root.results(serial, [])
    }
  }

  function cancel() { runner.cancel() }

  function activate(value, modifiers) {
    var argv = CalcModel.copyArgv(value)
    if (argv.length) Util.execArgv(argv)
  }

  LatestProcess {
    id: runner
    onFinished: function(serial, query, exitCode, output) {
      var value = exitCode === 0 ? CalcModel.parseQalc(output) : ""
      root.results(serial, value ? [CalcModel.row(value, query)] : [])
    }
  }
}
