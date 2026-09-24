// Application rows, built from Quickshell's DesktopEntries directly.
//
// The shell only hands its shared AppLibrary to a plugin whose manifest passes
// `manifestHasKind(manifest, "menu")` at the moment the scoped plugin API is
// built (shell.qml), and a third-party menu plugin never does: the first-party
// menu gets the real `shell` object instead and so never exercises that path.
// `shell.appLibrary` therefore arrives null here, and without this file the
// runner would list no applications at all. The pure parts live in JavaScript
// so they can be tested outside a running shell; AppSource.qml owns the live
// entry list, the hides file and the launching.
function entryName(entry) {
  return String((entry && entry.name) || (entry && entry.id) || "")
}

function entrySubtext(entry) {
  return String((entry && entry.genericName) || "")
}

function entryKeywords(entry) {
  var out = []
  try {
    var values = entry && entry.keywords
    if (!values) return out
    for (var i = 0; i < values.length; i++) {
      var value = String(values[i] || "")
      if (value) out.push(value)
    }
  } catch (e) {
  }
  return out
}

// `launcher.hides` is one desktop id per line, the same file the shell's own
// AppLibrary reads, so the runner hides exactly what the Omarchy launcher hides.
function parseHides(rawText) {
  var out = ({})
  var lines = String(rawText || "").split(/\n/)
  for (var i = 0; i < lines.length; i++) {
    var id = String(lines[i] || "").trim()
    if (id.slice(-8) === ".desktop") id = id.slice(0, -8)
    if (id.length > 0) out[id] = true
  }
  return out
}

function visibleEntries(values, hiddenIds) {
  var source = values || []
  var hidden = hiddenIds || ({})
  var out = []

  for (var i = 0; i < source.length; i++) {
    var entry = source[i]
    if (!entry || entry.noDisplay) continue
    if (hidden[String(entry.id || "")] === true) continue
    if (!entryName(entry)) continue
    out.push(entry)
  }

  out.sort(function(a, b) {
    var aName = entryName(a).toLowerCase()
    var bName = entryName(b).toLowerCase()
    if (aName < bName) return -1
    if (aName > bName) return 1
    var aId = String(a.id || "")
    var bId = String(b.id || "")
    if (aId < bId) return -1
    if (aId > bId) return 1
    return 0
  })

  return out
}

// Shaped like the rows parseMenuJsonc produces, so mergeAppRows can splice them
// into the menu tree and the search treats them like any other row.
function appRow(entry, order) {
  var appId = String((entry && entry.id) || "")
  var subtext = entrySubtext(entry)
  var aliases = subtext ? [subtext] : []
  aliases = aliases.concat(entryKeywords(entry))

  return {
    id: "apps." + appId,
    parent: "apps",
    kind: "app",
    icon: "",
    iconFont: "",
    appIcon: String((entry && entry.icon) || ""),
    appId: appId,
    label: entryName(entry),
    title: "",
    target: "",
    description: subtext,
    action: "",
    provider: "",
    aliases: aliases,
    when: "",
    checked: "",
    order: order || 0
  }
}

function appRows(values, hiddenIds) {
  var entries = visibleEntries(values, hiddenIds)
  var rows = []
  for (var i = 0; i < entries.length; i++) {
    if (!String(entries[i].id || "")) continue
    rows.push(appRow(entries[i], rows.length))
  }
  return rows
}

function shellQuote(value) {
  return "'" + String(value === undefined || value === null ? "" : value).replace(/'/g, "'\\''") + "'"
}

// Started inside a scope under app-graphical.slice so apps do not inherit
// wayland-wm@.service, exactly as the shell's AppLibrary launches them. The
// .desktop suffix stays on: ids like org.telegram.desktop will not resolve
// without it, and gtk-launch handles ids containing spaces.
function launchCommand(desktopId) {
  var id = String(desktopId || "")
  if (!id) return ""
  return "uwsm-app -- gtk-launch " + shellQuote(id + ".desktop")
}

function removeCommand(omarchyPath, desktopId, label) {
  var id = String(desktopId || "")
  if (!id) return ""
  var name = String(label || "") || id
  return shellQuote(String(omarchyPath || "") + "/bin/omarchy-remove-launcher-entry")
    + " " + shellQuote(id) + " " + shellQuote(name)
}
