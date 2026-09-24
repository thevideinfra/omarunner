import Quickshell
import QtQuick
import qs.Commons
import "WebModel.js" as WebModel

// "dd", "gg", "yt", "wiki" + query search that site; any other query offers
// one web search row, shown only when nothing else matched (fallback).
Item {
  id: root
  property string sourceId: "web"
  property string groupLabel: "Web"
  property string hint: "dd · gg · yt · wiki + query · or when nothing else matches"
  property int maxRows: 1
  property bool enabled: true
  property bool fallback: true
  property string searchUrl: ""
  signal results(int serial, var rows)

  function claims(query) { return WebModel.claims(query) }

  function search(query, serial) { root.results(serial, WebModel.rowsFor(query, root.searchUrl)) }

  // Enter opens the search in the default browser; Shift+Enter copies the URL.
  function activate(value, modifiers) {
    if (modifiers & Qt.ShiftModifier) Util.execArgv(["wl-copy", "--", String(value)])
    else Util.execArgv(WebModel.openArgv(value))
  }
}
