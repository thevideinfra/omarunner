import Quickshell
import QtQuick
import qs.Commons
import "LocationModel.js" as LocationModel
import "FileModel.js" as FileModel

// Locations: a URL opens in the browser, an existing path in its handler.
// Paths are checked with stat so a typo shows nothing. Leading.
Item {
  id: root
  property string sourceId: "locations"
  property string groupLabel: "Open"
  property int maxRows: 1
  property bool enabled: true
  property bool leading: true
  property string home: Quickshell.env("HOME")
  signal results(int serial, var rows)

  function search(query, serial) {
    var target = LocationModel.classify(query, root.home)
    if (!target) { statRunner.cancel(); root.results(serial, []); return }
    if (target.kind === "url") {
      statRunner.cancel()
      root.results(serial, [LocationModel.row(target.url, "Web", true)])
      return
    }
    statRunner.run(LocationModel.statArgs(target.path), serial, target.path)
  }

  function cancel() { statRunner.cancel() }

  // Enter opens; Shift+Enter copies a URL or reveals a path's folder.
  function activate(value, modifiers) {
    var shift = (modifiers & Qt.ShiftModifier)
    var isPath = String(value).charAt(0) === "/"
    if (shift && isPath) Util.execDetached(FileModel.revealCommand(value))
    else if (shift) Util.execArgv(["wl-copy", "--", String(value)])
    else Util.execArgv(LocationModel.openArgv(value))
  }

  LatestProcess {
    id: statRunner
    onFinished: function(serial, path, exitCode, output) {
      root.results(serial, exitCode === 0 ? [LocationModel.row(path, LocationModel.kindLabel(output), false)] : [])
    }
  }
}
