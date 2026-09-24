// Recent files source: ~/.local/share/recently-used.xbel, newest first.
function decodeXml(text) {
  return String(text).replace(/&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

function parseXbel(xmlText) {
  var re = /<bookmark\s[^>]*?href="([^"]+)"[^>]*>/g
  var seen = ({})
  var out = []
  var match
  while ((match = re.exec(String(xmlText || ""))) !== null) {
    var href = decodeXml(match[1])
    if (href.indexOf("file://") !== 0) continue
    var path
    try { path = decodeURIComponent(href.slice(7)) } catch (e) { continue }
    if (seen[path]) continue
    seen[path] = true
    var modified = /modified="([^"]+)"/.exec(match[0])
    out.push({ path: path, modified: modified ? modified[1] : "" })
  }
  out.sort(function(a, b) { return a.modified < b.modified ? 1 : a.modified > b.modified ? -1 : 0 })
  return out
}

// Every term must appear in the path; a basename hit on the first term ranks
// ahead, otherwise recency order holds.
// With fuzzy on, a basename holding the query's letters in order (3+
// characters) is appended after every substring hit.
function matches(entries, query, fuzzy) {
  var terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(function(t) { return t.length > 0 })
  if (terms.join(" ").length < 2) return []
  var needle = fuzzy === true ? terms.join("") : ""
  var list = Array.isArray(entries) ? entries : []
  var front = []
  var back = []
  var loose = []
  for (var i = 0; i < list.length; i++) {
    var path = list[i].path.toLowerCase()
    var base = path.split("/").pop()
    var ok = true
    for (var t = 0; t < terms.length; t++) if (path.indexOf(terms[t]) < 0) { ok = false; break }
    if (ok) (base.indexOf(terms[0]) >= 0 ? front : back).push(list[i].path)
    else if (needle.length >= 3 && inOrder(needle, base)) loose.push(list[i].path)
  }
  return front.concat(back, loose)
}

function inOrder(needle, text) {
  var pos = -1
  for (var i = 0; i < needle.length; i++) {
    pos = text.indexOf(needle.charAt(i), pos + 1)
    if (pos < 0) return false
  }
  return true
}

if (typeof module !== "undefined") {
  module.exports = { parseXbel: parseXbel, matches: matches }
}
