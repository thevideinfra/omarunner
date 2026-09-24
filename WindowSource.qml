import Quickshell
import QtQuick
import qs.Commons
import "WindowModel.js" as WindowModel

// Open windows by title or class; Enter focuses the window.
Item {
  id: root
  property string sourceId: "windows"
  property string groupLabel: "Windows"
  property string hint: "Open windows by title or app · jump to one"
  property int maxRows: 5
  property bool enabled: true
  signal results(int serial, var rows)

  function search(query, serial) {
    if (String(query || "").trim().length < 2) { clients.cancel(); root.results(serial, []); return }
    clients.run(WindowModel.clientsArgs(), serial, query)
  }

  function cancel() { clients.cancel() }

  function activate(value, modifiers) {
    var argv = WindowModel.focusArgv(value)
    if (argv.length) Util.execArgv(argv)
  }

  // The app's own icon when its desktop entry is known, else a window glyph.
  function iconFor(appClass) {
    var entry = DesktopEntries.heuristicLookup(appClass)
    return entry && entry.icon ? entry.icon : "window"
  }

  LatestProcess {
    id: clients
    onFinished: function(serial, query, exitCode, output) {
      var hits = exitCode === 0 ? WindowModel.matches(WindowModel.parseClients(output), query) : []
      var rows = []
      for (var i = 0; i < hits.length; i++) rows.push(WindowModel.row(hits[i], root.iconFor(hits[i].appClass)))
      root.results(serial, rows)
    }
  }
}
