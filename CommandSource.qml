import Quickshell
import QtQuick
import qs.Commons
import "CommandModel.js" as CommandModel

// "> cmd": Enter runs cmd in a terminal, Shift+Enter in the background.
Item {
  id: root
  property string sourceId: "command"
  property string groupLabel: "Command"
  property string hint: "> cmd · runs in a terminal, Shift: background"
  property int maxRows: 1
  property bool enabled: true
  signal results(int serial, var rows)

  function claims(query) { return CommandModel.claims(query) }

  function search(query, serial) {
    var cmd = CommandModel.command(query)
    root.results(serial, cmd ? [CommandModel.row(cmd)] : [])
  }

  function activate(value, modifiers) {
    var argv = (modifiers & Qt.ShiftModifier) ? CommandModel.backgroundArgv(value) : CommandModel.terminalArgv(value)
    if (argv.length) Util.execArgv(argv)
  }
}
