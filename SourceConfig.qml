import Quickshell
import Quickshell.Io
import QtQuick
import "SourceModel.js" as SourceModel

// omarunner.json: which sources are enabled. Hot-reloads while the file is
// watched; a toggle rewrites the whole merged config so hand-edited keys
// survive.
//
// A file that exists but does not parse is never silently replaced: the next
// toggle first copies it to omarunner.json.bak and only writes once the copy
// succeeded. If the copy fails the toggle stays in memory for this session and
// the malformed file is left untouched.
Item {
  id: root
  property string path: Quickshell.env("HOME") + "/.config/omarchy/omarunner.json"
  property var config: SourceModel.defaultConfig()
  // True when the file on disk has content that did not parse as a JSON object.
  property bool malformed: false

  function isEnabled(sourceId) { return SourceModel.isEnabled(root.config, sourceId) }

  function toggle(sourceId) { root.apply(SourceModel.toggled(root.config, sourceId)) }

  // Replaces the whole config (Sources toggles, Settings choices) and writes it.
  function apply(nextConfig) {
    root.config = nextConfig
    if (!root.malformed) { root.write(); return }
    if (!backup.running) {
      backup.command = ["cp", "-f", "--", root.path, root.path + ".bak"]
      backup.running = true
    }
    // A toggle while the copy runs is picked up by onExited, which writes the
    // latest root.config.
  }

  function write() { file.setText(SourceModel.serialize(root.config)) }

  function load(rawText) {
    var text = String(rawText || "")
    root.malformed = text.trim().length > 0 && !SourceModel.isValidConfigText(text)
    if (root.malformed) console.warn("omarunner: " + root.path + " is not valid JSON; using defaults")
    root.config = SourceModel.parseConfig(text)
  }

  FileView {
    id: file
    path: root.path
    watchChanges: true
    printErrors: false
    onLoaded: root.load(text())
    onFileChanged: reload()
    onLoadFailed: root.load("")
  }

  Process {
    id: backup
    onExited: function(exitCode) {
      if (exitCode === 0) {
        root.malformed = false
        root.write()
      } else {
        console.warn("omarunner: could not back up " + root.path + "; keeping source toggles in memory only")
      }
    }
  }
}
