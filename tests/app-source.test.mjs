import { test } from "node:test"
import assert from "node:assert/strict"
import { loadJsModule } from "./helpers/load-js-module.mjs"

const AppModel = await loadJsModule("AppModel.js")

// A desktop entry as Quickshell's DesktopEntries exposes it.
function entry(values) {
  return { id: "", name: "", genericName: "", comment: "", noDisplay: false, icon: "", keywords: [], ...values }
}

test("parseHides strips the .desktop suffix and surrounding whitespace", () => {
  const hides = AppModel.parseHides("btop\n  cups.desktop  \n\nlstopo\n")
  assert.deepEqual(hides, { btop: true, cups: true, lstopo: true })
})

test("parseHides on empty input hides nothing", () => {
  assert.deepEqual(AppModel.parseHides(""), {})
  assert.deepEqual(AppModel.parseHides(null), {})
})

test("visibleEntries drops entries the hides list names", () => {
  const values = [entry({ id: "btop", name: "btop++" }), entry({ id: "Btop", name: "Btop" })]
  const visible = AppModel.visibleEntries(values, { btop: true })
  assert.deepEqual(visible.map(e => e.id), ["Btop"])
})

test("visibleEntries matches the hides list case-sensitively, as the shell does", () => {
  const values = [entry({ id: "Btop", name: "Btop" })]
  assert.equal(AppModel.visibleEntries(values, { btop: true }).length, 1)
})

test("visibleEntries drops NoDisplay entries", () => {
  const values = [entry({ id: "hidden", name: "Hidden", noDisplay: true }), entry({ id: "shown", name: "Shown" })]
  assert.deepEqual(AppModel.visibleEntries(values, {}).map(e => e.id), ["shown"])
})

test("visibleEntries drops entries with no usable name", () => {
  const values = [entry({ id: "", name: "" }), entry({ id: "keep", name: "Keep" })]
  assert.deepEqual(AppModel.visibleEntries(values, {}).map(e => e.id), ["keep"])
})

test("visibleEntries falls back to the id when an entry has no name", () => {
  const values = [entry({ id: "only-id", name: "" })]
  assert.deepEqual(AppModel.visibleEntries(values, {}).map(e => AppModel.entryName(e)), ["only-id"])
})

test("visibleEntries sorts case-insensitively by name, then by id", () => {
  const values = [
    entry({ id: "zed", name: "Zed" }),
    entry({ id: "brave", name: "brave" }),
    entry({ id: "b", name: "Same" }),
    entry({ id: "a", name: "Same" })
  ]
  assert.deepEqual(AppModel.visibleEntries(values, {}).map(e => e.id), ["brave", "a", "b", "zed"])
})

test("appRow carries the label, id and icon the menu row needs", () => {
  const row = AppModel.appRow(entry({ id: "org.gnome.Nautilus", name: "Files", genericName: "File Manager", icon: "nautilus" }))
  assert.equal(row.id, "apps.org.gnome.Nautilus")
  assert.equal(row.parent, "apps")
  assert.equal(row.kind, "app")
  assert.equal(row.appId, "org.gnome.Nautilus")
  assert.equal(row.label, "Files")
  assert.equal(row.appIcon, "nautilus")
  assert.equal(row.description, "File Manager")
})

test("appRow makes the generic name and keywords searchable as aliases", () => {
  const row = AppModel.appRow(entry({ id: "foot", name: "foot", genericName: "Terminal", keywords: ["shell", "console"] }))
  assert.deepEqual(row.aliases, ["Terminal", "shell", "console"])
})

test("appRow survives an entry whose keywords are missing", () => {
  const row = AppModel.appRow(entry({ id: "bare", name: "Bare", keywords: undefined }))
  assert.deepEqual(row.aliases, [])
})

test("appRow keeps ids that contain spaces intact", () => {
  const row = AppModel.appRow(entry({ id: "proton mail", name: "proton mail" }))
  assert.equal(row.id, "apps.proton mail")
  assert.equal(row.appId, "proton mail")
})

test("appRows builds one row per visible entry, in visible order", () => {
  const values = [
    entry({ id: "zed", name: "Zed" }),
    entry({ id: "btop", name: "btop++" }),
    entry({ id: "Btop", name: "Btop" })
  ]
  const rows = AppModel.appRows(values, { btop: true })
  assert.deepEqual(rows.map(r => r.label), ["Btop", "Zed"])
  assert.deepEqual(rows.map(r => r.order), [0, 1])
})

test("launchCommand starts the entry through uwsm-app and gtk-launch", () => {
  assert.equal(AppModel.launchCommand("org.telegram.desktop"), "uwsm-app -- gtk-launch 'org.telegram.desktop.desktop'")
})

test("launchCommand quotes an id containing spaces", () => {
  assert.equal(AppModel.launchCommand("proton mail"), "uwsm-app -- gtk-launch 'proton mail.desktop'")
})

test("launchCommand rejects an empty id", () => {
  assert.equal(AppModel.launchCommand(""), "")
})

test("removeCommand calls omarchy-remove-launcher-entry with the id and the label", () => {
  assert.equal(
    AppModel.removeCommand("/usr/share/omarchy", "proton mail", "proton mail"),
    "'/usr/share/omarchy/bin/omarchy-remove-launcher-entry' 'proton mail' 'proton mail'"
  )
})

test("removeCommand falls back to the id when no label is given", () => {
  assert.equal(
    AppModel.removeCommand("/usr/share/omarchy", "foot", ""),
    "'/usr/share/omarchy/bin/omarchy-remove-launcher-entry' 'foot' 'foot'"
  )
})

test("removeCommand rejects an empty id", () => {
  assert.equal(AppModel.removeCommand("/usr/share/omarchy", "", "x"), "")
})

test("shellQuote escapes an embedded single quote", () => {
  assert.equal(AppModel.shellQuote("it's"), "'it'\\''s'")
})
