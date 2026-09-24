import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"
const L = await loadJsModule("LocationModel.js")
const Cmd = await loadJsModule("CommandModel.js")
const K = await loadJsModule("KillModel.js")
const R = await loadJsModule("RecentModel.js")
const Cb = await loadJsModule("ClipboardModel.js")
const HOME = "/home/ks"

// -- Locations

test("classify recognises URLs with and without a scheme", () => {
  assert.deepEqual(L.classify("https://example.com/a?b=1", HOME), { kind: "url", url: "https://example.com/a?b=1" })
  assert.deepEqual(L.classify("github.com/thevideinfra", HOME), { kind: "url", url: "https://github.com/thevideinfra" })
  assert.deepEqual(L.classify("www.kde.org", HOME), { kind: "url", url: "https://www.kde.org" })
  assert.deepEqual(L.classify("localhost:8080", HOME), { kind: "url", url: "http://localhost:8080" })
})

test("classify leaves file names and prose alone", () => {
  for (const q of ["notes.md", "setup.sh", "v1.2", "foo.bar baz", "firefox", ""]) assert.equal(L.classify(q, HOME), null, q)
})

test("classify expands paths", () => {
  assert.deepEqual(L.classify("/etc/hosts", HOME), { kind: "path", path: "/etc/hosts" })
  assert.deepEqual(L.classify("~/Downloads", HOME), { kind: "path", path: "/home/ks/Downloads" })
  assert.deepEqual(L.classify("~", HOME), { kind: "path", path: "/home/ks" })
})

test("stat output becomes a short kind label", () => {
  assert.equal(L.kindLabel("directory\n"), "Folder")
  assert.equal(L.kindLabel("regular empty file"), "File")
  assert.equal(L.kindLabel(""), "")
  assert.deepEqual(L.statArgs("/x y"), ["stat", "-L", "-c", "%F", "--", "/x y"])
  assert.deepEqual(L.openArgv("https://a.io"), ["xdg-open", "https://a.io"])
})

// -- Command

test("> claims the query and yields the command", () => {
  assert.equal(Cmd.claims("> htop"), true)
  assert.equal(Cmd.claims("htop"), false)
  assert.equal(Cmd.command(">  ls -la "), "ls -la")
  assert.equal(Cmd.command(">"), "")
})

test("terminal runs keep the shell open; background runs do not", () => {
  assert.deepEqual(Cmd.terminalArgv("htop"), ["omarchy-launch-terminal", "bash", "-lc", "htop; exec bash"])
  assert.deepEqual(Cmd.backgroundArgv("notify-send hi"), ["bash", "-lc", "notify-send hi"])
  assert.deepEqual(Cmd.terminalArgv(""), [])
  assert.equal(Cmd.row("htop").value, "htop")
})

// -- Kill

const PS = `    1 systemd /sbin/init
  812 firefox /usr/lib/firefox/firefox
  900 Web\\ Content /usr/lib/firefox/firefox -contentproc
 1200 ps ps -x -o pid=,comm=,args=
 1300 foot foot -e firefox-helper
`

test("kill claims only its keyword", () => {
  assert.equal(K.claims("kill fire"), true)
  assert.equal(K.claims("kill"), true)
  assert.equal(K.claims("killall"), false)
  assert.equal(K.filter("kill  fire fox"), "fire fox")
})

test("ps output is parsed without ps itself", () => {
  const procs = K.parsePs(PS)
  assert.equal(procs.some(p => p.name === "ps"), false)
  assert.deepEqual(procs[1], { pid: "812", name: "firefox", args: "/usr/lib/firefox/firefox" })
})

test("matches rank name-prefix hits first and need a filter", () => {
  const procs = K.parsePs(PS)
  assert.deepEqual(K.matches(procs, "fire").map(p => p.pid), ["812", "900", "1300"])
  assert.deepEqual(K.matches(procs, ""), [])
})

test("kill argv refuses anything but a pid", () => {
  assert.deepEqual(K.killArgv("812", false), ["kill", "812"])
  assert.deepEqual(K.killArgv("812", true), ["kill", "-KILL", "812"])
  assert.deepEqual(K.killArgv("1; rm -rf ~", false), [])
})

// -- Recent

const XBEL = `<xbel>
  <bookmark href="file:///home/ks/Docs/old%20report.pdf" added="x" modified="2026-09-01T00:00:00Z" visited="x">
  </bookmark>
  <bookmark href="file:///home/ks/Docs/report.odt" added="x" modified="2026-09-20T00:00:00Z" visited="x">
  </bookmark>
  <bookmark href="https://example.com/" added="x" modified="2026-09-21T00:00:00Z" visited="x">
  </bookmark>
  <bookmark href="file:///home/ks/reports/q3.xlsx" added="x" modified="2026-09-22T00:00:00Z" visited="x">
  </bookmark>
</xbel>`

test("parseXbel keeps local files, decoded, newest first", () => {
  assert.deepEqual(R.parseXbel(XBEL).map(e => e.path),
    ["/home/ks/reports/q3.xlsx", "/home/ks/Docs/report.odt", "/home/ks/Docs/old report.pdf"])
  assert.deepEqual(R.parseXbel("not xml"), [])
})

test("recent matches prefer basename hits, then recency", () => {
  const entries = R.parseXbel(XBEL)
  assert.deepEqual(R.matches(entries, "report"),
    ["/home/ks/Docs/report.odt", "/home/ks/Docs/old report.pdf", "/home/ks/reports/q3.xlsx"])
  assert.deepEqual(R.matches(entries, "r"), [])
})

// -- Clipboard

const HISTORY = JSON.stringify([
  { type: "text", text: "git push origin master" },
  { type: "image", mime: "image/png", path: "/tmp/x.png" },
  { type: "text", text: "line one\n  line   two\nline three" },
  { type: "text", text: "git status" }
])

test("cb claims only its keyword", () => {
  assert.equal(Cb.claims("cb git"), true)
  assert.equal(Cb.claims("cb"), true)
  assert.equal(Cb.claims("cbonsai"), false)
  assert.equal(Cb.filter("CB  git push"), "git push")
})

test("matches search text entries, keep file indices, and need every term", () => {
  const history = Cb.parseHistory(HISTORY)
  assert.deepEqual(Cb.matches(history, "git").map(e => e.index), [0, 3])
  assert.deepEqual(Cb.matches(history, "git push").map(e => e.index), [0])
  assert.deepEqual(Cb.parseHistory("{bad"), [])
})

test("bare cb lists the newest entries, images included", () => {
  const history = Cb.parseHistory(HISTORY)
  assert.deepEqual(Cb.matches(history, "").map(e => e.index), [0, 1, 2, 3])
})

test("image words list only images", () => {
  const history = Cb.parseHistory(HISTORY)
  for (const word of ["screenshot", "screenshots", "image", "images", "img", "picture"]) {
    assert.deepEqual(Cb.matches(history, word).map(e => e.index), [1], word)
  }
})

test("image rows show a thumbnail and paste as a file", () => {
  const history = Cb.parseHistory(HISTORY)
  const [entry] = Cb.matches(history, "image")
  const row = Cb.row(entry)
  assert.equal(row.label, "Image")
  assert.equal(row.appIcon, "file:///tmp/x.png")
  assert.equal(row.value, "image:/tmp/x.png")
  assert.deepEqual(Cb.activateArgv(history, row.value, false), ["omarchy-clipboard-paste-file", "image/png", "/tmp/x.png"])
  assert.deepEqual(Cb.activateArgv(history, row.value, true), ["omarchy-clipboard-paste-file", "--copy-only", "image/png", "/tmp/x.png"])
})

test("cb list opens the clipboard manager", () => {
  assert.equal(Cb.isListCommand("cb list"), true)
  assert.equal(Cb.isListCommand("cb  LIST "), true)
  assert.equal(Cb.isListCommand("cb lists"), false)
  const row = Cb.listRow()
  assert.equal(row.value, "list:")
  assert.deepEqual(Cb.activateArgv([], "list:", false), ["omarchy-menu-clipboard"])
})

test("rows show the first line and a line count", () => {
  const history = Cb.parseHistory(HISTORY)
  const row = Cb.row(Cb.matches(history, "line")[0])
  assert.equal(row.value, "text:line one\n  line   two\nline three")
  assert.equal(row.label, "line one")
  assert.equal(row.detail, "3 lines")
  assert.equal(Cb.label("  \n  a   b  "), "a b")
  assert.equal(Cb.label("x".repeat(100)).length, 80)
})

test("activation resolves the index by text after the history moved", () => {
  const history = Cb.parseHistory(HISTORY)
  const moved = [{ type: "text", text: "new copy" }].concat(history)
  assert.equal(Cb.resolveIndex(moved, "git status"), 4)
  assert.equal(Cb.resolveIndex(moved, "gone"), -1)
  assert.deepEqual(Cb.activateArgv(moved, "text:git status", false), ["omarchy-clipboard-paste-text", "--history-index", "4"])
  assert.deepEqual(Cb.activateArgv(moved, "text:git status", true), ["omarchy-clipboard-paste-text", "--copy-only", "--history-index", "4"])
  assert.deepEqual(Cb.activateArgv(moved, "text:gone", false), [])
})

test("recent fuzzy hits follow substring hits, only when enabled", () => {
  const entries = R.parseXbel(XBEL)
  assert.deepEqual(R.matches(entries, "rprt", false), [])
  assert.deepEqual(R.matches(entries, "rprt", true),
    ["/home/ks/Docs/report.odt", "/home/ks/Docs/old report.pdf"])
  assert.deepEqual(R.matches(entries, "q3", true), ["/home/ks/reports/q3.xlsx"])
})

test("clipboard rows only exist behind the cb prefix", () => {
  const history = Cb.parseHistory(HISTORY)
  for (const q of ["etc", "git", "documents", "c", "cbx"]) assert.deepEqual(Cb.rowsFor(history, q, 8), [], q)
  assert.equal(Cb.rowsFor(history, "cb", 8).length, 4)
  assert.equal(Cb.rowsFor(history, "cb", 2).length, 2)
  assert.deepEqual(Cb.rowsFor(history, "cb git", 8).map(r => r.label), ["git push origin master", "git status"])
  assert.deepEqual(Cb.rowsFor(history, "cb list", 8).map(r => r.value), ["list:"])
})

test("the start of an image word lists images first, then matching text", () => {
  const history = [
    { type: "text", text: "./script.sh --fast" },
    { type: "image", mime: "image/png", path: "/tmp/a.png" },
    { type: "text", text: "unrelated" },
    { type: "image", mime: "image/png", path: "/tmp/b.png" }
  ]
  assert.deepEqual(Cb.matches(history, "scr").map(e => e.index), [1, 3, 0])
  assert.deepEqual(Cb.matches(history, "sc").map(e => e.index), [1, 3, 0])
  assert.deepEqual(Cb.matches(history, "im").map(e => e.index), [1, 3])
  assert.deepEqual(Cb.matches(history, "s").map(e => e.index), [0])
  assert.deepEqual(Cb.matches(history, "screenshot").map(e => e.index), [1, 3])
})
