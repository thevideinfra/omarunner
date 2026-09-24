import Quickshell
import Quickshell.Io
import QtQuick
import qs.Commons
import "AppModel.js" as AppModel

// The runner's own application source.
//
// The shell keeps a shared AppLibrary and hands it to menu plugins, but a
// third-party plugin receives a scoped API whose appLibrary is null (see
// AppModel.js), so the runner reads Quickshell's DesktopEntries itself. The
// hides file is the shell's own, so the runner lists exactly what the Omarchy
// launcher lists.
Item {
  id: root

  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var hiddenIds: ({})

  // Emitted when the visible application set may have changed: entries
  // appeared or vanished, or the hides file was rewritten.
  signal appsChanged()

  function rows() {
    var values = DesktopEntries.applications ? (DesktopEntries.applications.values || []) : []
    return AppModel.appRows(values, root.hiddenIds)
  }

  function iconSource(icon) {
    var value = String(icon || "")
    if (value.length === 0) return Quickshell.iconPath("application-x-executable", true)
    if (value.indexOf("file://") === 0 || value.indexOf("image://") === 0) return value
    if (value.charAt(0) === "/") return Util.fileUrl(value)
    var themed = Quickshell.iconPath(value, true)
    if (themed.length > 0) return themed
    return Quickshell.iconPath("application-x-executable", true)
  }

  function launch(desktopId, name) {
    var command = AppModel.launchCommand(desktopId)
    if (command) Util.execDetached(command)
  }

  function remove(desktopId, name) {
    var command = AppModel.removeCommand(root.omarchyPath, desktopId, name)
    if (command) Util.execDetached(command)
  }

  function loadHides(rawText) {
    root.hiddenIds = AppModel.parseHides(rawText)
    root.appsChanged()
  }

  FileView {
    path: root.omarchyPath + "/default/omarchy/launcher.hides"
    watchChanges: true
    printErrors: false
    onLoaded: root.loadHides(text())
    onFileChanged: root.loadHides(text())
    onLoadFailed: root.loadHides("")
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { root.appsChanged() }
  }
}
