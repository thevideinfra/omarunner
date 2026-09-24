// Kill source: "kill name" lists the user's matching processes. Enter sends
// SIGTERM, Shift+Enter SIGKILL.
// A name must follow: a bare "kill" (or "killer") stays an ordinary search
// instead of blanking the list.
function claims(query) { return /^kill\s+\S/i.test(String(query || "").trim()) }

function filter(query) { return claims(query) ? String(query).trim().slice(4).trim() : "" }

// Every process of the current user, with or without a terminal.
function psArgs() { return ["ps", "-x", "-o", "pid=,comm=,args="] }

function parsePs(stdoutText) {
  var lines = String(stdoutText || "").split("\n")
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var match = /^\s*(\d+)\s+(\S+)\s*(.*)$/.exec(lines[i])
    if (!match || match[2] === "ps") continue
    out.push({ pid: match[1], name: match[2], args: match[3] || match[2] })
  }
  return out
}

function matches(processes, filterText) {
  var terms = String(filterText || "").toLowerCase().split(/\s+/).filter(function(t) { return t.length > 0 })
  if (terms.length === 0) return []
  var list = Array.isArray(processes) ? processes : []
  var hits = []
  for (var i = 0; i < list.length; i++) {
    var haystack = (list[i].name + " " + list[i].args).toLowerCase()
    var ok = true
    for (var t = 0; t < terms.length; t++) if (haystack.indexOf(terms[t]) < 0) { ok = false; break }
    if (ok) hits.push(list[i])
  }
  var first = terms[0]
  hits.sort(function(a, b) {
    var ap = a.name.toLowerCase().indexOf(first) === 0 ? 0 : 1
    var bp = b.name.toLowerCase().indexOf(first) === 0 ? 0 : 1
    if (ap !== bp) return ap - bp
    if (a.name !== b.name) return a.name < b.name ? -1 : 1
    return Number(a.pid) - Number(b.pid)
  })
  return hits
}

function row(proc) {
  var args = String(proc.args || "")
  if (args.length > 80) args = args.slice(0, 79) + "…"
  return {
    itemId: "kill." + proc.pid, kind: "source", icon: "process-stop", iconFont: "", appIcon: "", appId: "",
    label: "Kill " + proc.name, target: "", detail: "pid " + proc.pid + " · " + args, path: "", childCount: 0,
    action: "", provider: "", score: 0, section: "", sourceId: "kill", value: String(proc.pid)
  }
}

function killArgv(pid, force) {
  if (!/^\d+$/.test(String(pid || ""))) return []
  return force ? ["kill", "-KILL", String(pid)] : ["kill", String(pid)]
}

if (typeof module !== "undefined") {
  module.exports = { claims: claims, filter: filter, psArgs: psArgs, parsePs: parsePs, matches: matches, row: row, killArgv: killArgv }
}
