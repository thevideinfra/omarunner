// Web source: "dd query", "gg query", "yt query" or "wiki query" (a colon
// works too: "dd:query") searches that site; any other query gets one
// "Search the web" row, shown only when nothing else matched.
function ENGINES() {
  return {
    dd: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
    gg: { name: "Google", url: "https://www.google.com/search?q=" },
    yt: { name: "YouTube", url: "https://www.youtube.com/results?search_query=" },
    wiki: { name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=" }
  }
}

// { engine, terms } for a keyword query, else null.
function parseKeyword(query) {
  var match = /^(dd|gg|yt|wiki)(?::\s*|\s+)(.*)$/i.exec(String(query || "").trim())
  if (!match) return null
  return { engine: match[1].toLowerCase(), terms: match[2].trim() }
}

// Only a keyword with a query after it claims: a bare "wiki" or "yt" is still
// an ordinary search (a Wikipedia app, a "yt" folder).
function claims(query) {
  var keyword = parseKeyword(query)
  return keyword !== null && keyword.terms.length > 0
}

function searchUrl(base, terms) { return String(base) + encodeURIComponent(terms) }

function isDefaultEngine(webSearchUrl) { return !webSearchUrl || webSearchUrl === ENGINES().dd.url }

// The rows for one query. Keyword queries name their site; other queries get
// the fallback row, marked so the runner shows it only when nothing else did.
function rowsFor(query, webSearchUrl) {
  var text = String(query || "").trim()
  var keyword = parseKeyword(text)
  if (keyword) {
    if (!keyword.terms) return []
    var engine = ENGINES()[keyword.engine]
    return [row("Search " + engine.name + " for “" + keyword.terms + "”", searchUrl(engine.url, keyword.terms))]
  }
  if (text.length < 2) return []
  var base = webSearchUrl || ENGINES().dd.url
  var name = isDefaultEngine(webSearchUrl) ? "DuckDuckGo" : "the web"
  return [row("Search " + name + " for “" + text + "”", searchUrl(base, text))]
}

function row(rowLabel, url) {
  return {
    itemId: "web." + url, kind: "source", icon: "web-browser", iconFont: "", appIcon: "", appId: "",
    label: rowLabel, target: "", detail: "", path: "", childCount: 0, action: "", provider: "",
    score: 0, section: "", sourceId: "web", value: url
  }
}

function openArgv(url) { return url ? ["xdg-open", String(url)] : [] }

if (typeof module !== "undefined") {
  module.exports = { parseKeyword: parseKeyword, claims: claims, rowsFor: rowsFor, openArgv: openArgv }
}
