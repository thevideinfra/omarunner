// Windows source: open Hyprland windows by title or class. Enter focuses the
// window, switching workspace as Hyprland does.
function clientsArgs() { return ["hyprctl", "clients", "-j"] }

function parseClients(stdoutText) {
  var parsed
  try { parsed = JSON.parse(String(stdoutText || "")) } catch (e) { return [] }
  if (!Array.isArray(parsed)) return []
  var out = []
  for (var i = 0; i < parsed.length; i++) {
    var c = parsed[i]
    if (!c || c.mapped === false || !/^0x[0-9a-f]+$/i.test(String(c.address || ""))) continue
    out.push({
      address: String(c.address),
      appClass: String(c["class"] || c.initialClass || ""),
      title: String(c.title || c.initialTitle || ""),
      workspace: c.workspace && c.workspace.name !== undefined ? String(c.workspace.name) : "",
      recency: typeof c.focusHistoryID === "number" ? c.focusHistoryID : 999
    })
  }
  return out
}

// Every term must appear in the class or title; a class or title starting
// with the first term ranks ahead, then the most recently focused.
function matches(windows, query) {
  var terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(function(t) { return t.length > 0 })
  if (terms.join(" ").length < 2) return []
  var list = Array.isArray(windows) ? windows : []
  var hits = []
  for (var i = 0; i < list.length; i++) {
    var cls = list[i].appClass.toLowerCase()
    var title = list[i].title.toLowerCase()
    var haystack = cls + " " + title
    var ok = true
    for (var t = 0; t < terms.length; t++) if (haystack.indexOf(terms[t]) < 0) { ok = false; break }
    if (!ok) continue
    var prefix = cls.indexOf(terms[0]) === 0 || title.indexOf(terms[0]) === 0 ? 0 : 1
    hits.push({ win: list[i], prefix: prefix })
  }
  hits.sort(function(a, b) { return (a.prefix - b.prefix) || (a.win.recency - b.win.recency) })
  return hits.map(function(h) { return h.win })
}

function row(win, icon) {
  var detail = win.appClass + (win.workspace ? " · workspace " + win.workspace : "")
  return {
    itemId: "windows." + win.address, kind: "source", icon: icon || "window", iconFont: "", appIcon: "", appId: "",
    label: win.title || win.appClass, target: "", detail: detail, path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "windows", value: win.address
  }
}

// Hyprland here takes Lua dispatch expressions; the address is validated so
// nothing but a hex window id reaches the expression.
function focusArgv(address) {
  if (!/^0x[0-9a-f]+$/i.test(String(address || ""))) return []
  return ["hyprctl", "dispatch", "hl.dsp.focus({ window = \"address:" + address + "\" })"]
}

if (typeof module !== "undefined") {
  module.exports = { clientsArgs: clientsArgs, parseClients: parseClients, matches: matches, row: row, focusArgv: focusArgv }
}
