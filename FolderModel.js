// Folders source: well-known folders by name, forgiving of case and typos.
// "documents" or "docmuents" finds ~/Documents, "etc" finds /etc.
//
// Candidates: home folders two levels deep, ~/.config one level deep, and the
// top level of /. Listed once and refreshed now and then, never per keystroke.
function listArgs() {
  return ["sh", "-c",
    "fd --type d --max-depth 2 --color never . \"$HOME\"; " +
    "fd --type d --max-depth 1 --hidden --color never . \"$HOME/.config\"; " +
    "find / -mindepth 1 -maxdepth 1 -type d 2>/dev/null"]
}

function SKIPPED_ROOT() { return ["/proc", "/sys", "/dev", "/.snapshots", "/lost+found", "/swap"] }

function parseList(stdoutText) {
  var lines = String(stdoutText || "").split("\n")
  var seen = ({})
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var path = lines[i].trim().replace(/\/+$/, "")
    if (!path || seen[path] || SKIPPED_ROOT().indexOf(path) >= 0) continue
    seen[path] = true
    out.push({ path: path, name: path.split("/").pop() })
  }
  return out
}

// Optimal string alignment distance: insertions, deletions, substitutions and
// adjacent transpositions ("downlaods" is one step from "downloads").
function editDistance(a, b) {
  var s = String(a)
  var t = String(b)
  var d = []
  for (var i = 0; i <= s.length; i++) { d.push([i]) }
  for (var j = 1; j <= t.length; j++) d[0][j] = j
  for (i = 1; i <= s.length; i++) {
    for (j = 1; j <= t.length; j++) {
      var cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && s.charAt(i - 1) === t.charAt(j - 2) && s.charAt(i - 2) === t.charAt(j - 1))
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[s.length][t.length]
}

// Letters in order from the start of text, skipping no more letters than
// were typed (the same spread rule as the menu's fuzzy matching).
function inOrder(needle, text) {
  var pos = -1
  for (var i = 0; i < needle.length; i++) {
    pos = text.indexOf(needle.charAt(i), pos + 1)
    if (pos < 0) return false
  }
  return pos + 1 - needle.length <= needle.length
}

// 0 exact, 1 prefix, 2 typo (against the name, or the same-length start of
// it), 3 substring, 4 letters in order (fuzzy only); -1 no match.
function matchTier(name, query, fuzzy) {
  var n = String(name || "").toLowerCase().replace(/^\./, "")
  var q = String(query || "").toLowerCase().trim()
  if (q.length < 2 || !n) return -1
  if (n === q) return 0
  if (n.indexOf(q) === 0) return 1
  if (q.length >= 4) {
    var allowed = q.length >= 7 ? 2 : 1
    if (editDistance(q, n) <= allowed || editDistance(q, n.slice(0, q.length)) <= allowed) return 2
  }
  if (q.length >= 3 && n.indexOf(q) >= 0) return 3
  if (fuzzy === true && q.length >= 3 && n.charAt(0) === q.charAt(0) && inOrder(q, n)) return 4
  return -1
}

// Queries that already look like a path are left to the Open source.
function matches(folders, query, fuzzy) {
  var q = String(query || "").trim()
  if (!q || /[\/~\s]/.test(q)) return []
  var list = Array.isArray(folders) ? folders : []
  var hits = []
  for (var i = 0; i < list.length; i++) {
    var tier = matchTier(list[i].name, q, fuzzy)
    if (tier >= 0) hits.push({ folder: list[i], tier: tier, depth: list[i].path.split("/").length })
  }
  hits.sort(function(a, b) {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.depth !== b.depth) return a.depth - b.depth
    return a.folder.path < b.folder.path ? -1 : a.folder.path > b.folder.path ? 1 : 0
  })
  return hits.map(function(h) { return h.folder })
}

function row(folder, home) {
  var root = String(home || "")
  var path = folder.path
  var shown = root && (path === root || path.indexOf(root + "/") === 0) ? "~" + path.slice(root.length) : path
  return {
    itemId: "folders." + path, kind: "source", icon: "folder", iconFont: "", appIcon: "", appId: "",
    label: folder.name, target: "", detail: shown, path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "folders", value: path
  }
}

function openArgv(path) { return path ? ["xdg-open", String(path)] : [] }

// Shift+Enter: a terminal in that folder.
function terminalArgv(path) { return path ? ["xdg-terminal-exec", "--dir=" + String(path)] : [] }

if (typeof module !== "undefined") {
  module.exports = { listArgs: listArgs, parseList: parseList, editDistance: editDistance, matchTier: matchTier,
    matches: matches, row: row, openArgv: openArgv, terminalArgv: terminalArgv }
}
