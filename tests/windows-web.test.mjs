import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const W = await loadJsModule("WindowModel.js")
const Web = await loadJsModule("WebModel.js")

const CLIENTS = JSON.stringify([
  { address: "0xaa", class: "brave-origin", title: "GitHub - omarunner", workspace: { id: 2, name: "2" }, focusHistoryID: 1, mapped: true },
  { address: "0xbb", class: "foot", title: "nvim Runner.qml", workspace: { id: 1, name: "1" }, focusHistoryID: 0, mapped: true },
  { address: "0xcc", class: "foot", title: "htop", workspace: { id: 3, name: "3" }, focusHistoryID: 2, mapped: true },
  { address: "bad; rm", class: "x", title: "x", mapped: true },
  { address: "0xdd", class: "hidden", title: "unmapped", mapped: false }
])

// -- Windows

test("parseClients keeps mapped windows with valid addresses", () => {
  const wins = W.parseClients(CLIENTS)
  assert.deepEqual(wins.map(w => w.address), ["0xaa", "0xbb", "0xcc"])
  assert.deepEqual(wins[0], { address: "0xaa", appClass: "brave-origin", title: "GitHub - omarunner", workspace: "2", recency: 1 })
  assert.deepEqual(W.parseClients("nope"), [])
})

test("matches search class and title, prefix hits then most recent", () => {
  const wins = W.parseClients(CLIENTS)
  assert.deepEqual(W.matches(wins, "foot").map(w => w.address), ["0xbb", "0xcc"])
  assert.deepEqual(W.matches(wins, "omarunner").map(w => w.address), ["0xaa"])
  assert.deepEqual(W.matches(wins, "runner").map(w => w.address), ["0xbb", "0xaa"])
  assert.deepEqual(W.matches(wins, "h"), [])
})

test("rows show title, class and workspace; focus validates the address", () => {
  const [win] = W.matches(W.parseClients(CLIENTS), "htop")
  const row = W.row(win, "foot")
  assert.equal(row.label, "htop")
  assert.equal(row.detail, "foot · workspace 3")
  assert.equal(row.icon, "foot")
  assert.deepEqual(W.focusArgv("0xcc"), ["hyprctl", "dispatch", 'hl.dsp.focus({ window = "address:0xcc" })'])
  assert.deepEqual(W.focusArgv('0xcc" }) os.execute("x'), [])
})

// -- Web

test("keywords claim the query with a space or a colon", () => {
  assert.deepEqual(Web.parseKeyword("dd omarchy"), { engine: "dd", terms: "omarchy" })
  assert.deepEqual(Web.parseKeyword("GG: qt layershell"), { engine: "gg", terms: "qt layershell" })
  assert.deepEqual(Web.parseKeyword("wiki:krunner"), { engine: "wiki", terms: "krunner" })
  assert.equal(Web.parseKeyword("ddg omarchy"), null)
  assert.equal(Web.claims("yt"), false)
  assert.equal(Web.claims("dd:"), false)
  assert.equal(Web.claims("yt lofi"), true)
  assert.equal(Web.claims("youtube"), false)
})

test("keyword rows search their site, encoded", () => {
  const [row] = Web.rowsFor("gg a&b c", "")
  assert.equal(row.label, "Search Google for “a&b c”")
  assert.equal(row.value, "https://www.google.com/search?q=a%26b%20c")
  // A bare keyword is an ordinary query: it only gets the fallback row.
  assert.equal(Web.rowsFor("dd ", "")[0].label, "Search DuckDuckGo for “dd”")
})

test("other queries get the fallback row on the configured engine", () => {
  const [row] = Web.rowsFor("omarchy themes", "https://duckduckgo.com/?q=")
  assert.equal(row.label, "Search DuckDuckGo for “omarchy themes”")
  assert.equal(row.value, "https://duckduckgo.com/?q=omarchy%20themes")
  const [custom] = Web.rowsFor("x y", "https://search.example/?q=")
  assert.equal(custom.label, "Search the web for “x y”")
  assert.deepEqual(Web.rowsFor("a", ""), [])
  assert.deepEqual(Web.openArgv("https://a.io"), ["xdg-open", "https://a.io"])
})
