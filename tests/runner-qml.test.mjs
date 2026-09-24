import { test } from "node:test"
import assert from "node:assert/strict"
import { readFile, access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const qml = await readFile(join(root, "Runner.qml"), "utf8")
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"))

test("manifest declares the runner plugin", () => {
  assert.equal(manifest.id, "videinfra.omarunner")
  assert.deepEqual(manifest.kinds, ["menu"])
  assert.equal(manifest.entryPoints.menu, "Runner.qml")
})

test("manifest entry point exists", async () => {
  await access(join(root, manifest.entryPoints.menu))
})

test("no dmenu code survives the fork", () => {
  for (const needle of ["dmenu", "selectionFile", "doneFile", "finishRequest", "requestActive"]) {
    assert.equal(qml.includes(needle), false, `Runner.qml still mentions ${needle}`)
  }
})

test("Runner.qml imports RunnerModel and delegates row building to it", () => {
  assert.match(qml, /import "RunnerModel\.js" as RunnerModel/)
  assert.match(qml, /RunnerModel\.buildRows\(/)
})

test("the root placeholder reads Search", () => {
  assert.match(qml, /"Search…"/)
})

test("the collapsed root drops the row area from the card", () => {
  assert.match(qml, /property bool collapsed:/)
})

test("the lifecycle hooks the shell calls are present", () => {
  for (const hook of ["function open(", "function close(", "function refresh(", "function ping("]) {
    assert.ok(qml.includes(hook), `Runner.qml is missing ${hook}`)
  }
})

// -- Phase 1: search sources (verbatim from the search-sources-phase1 plan,
// checked against the shipped Runner.qml/FileSource.qml).

test("runner registers the files source and its config", () => {
  assert.match(qml, /FileSource\s*\{/)
  assert.match(qml, /SourceConfig\s*\{/)
  assert.match(qml, /property var sources:/)
  assert.match(qml, /property int searchSerial:/)
  assert.match(qml, /interval: 120/)
})

test("section delegate renders source captions", () => {
  assert.match(qml, /indexOf\("source:"\) === 0/)
  assert.match(qml, /root\.sectionLabels\[/)
})

test("source rows activate through their source with modifiers", () => {
  assert.match(qml, /row\.kind === "source"/)
  assert.match(qml, /\.activate\(row\.value, /)
})

test("FileSource implements the source interface", async () => {
  const src = await readFile(join(root, "FileSource.qml"), "utf8")
  for (const needle of ["property string sourceId", "property string groupLabel", "property int maxRows",
    "property bool enabled", "function search(", "function activate(", "signal results("]) {
    assert.ok(src.includes(needle), `FileSource.qml missing ${needle}`)
  }
  assert.match(src, /import "FileModel\.js" as FileModel/)
})

test("sources page is injected and toggles through the config", () => {
  assert.match(qml, /function refreshSourcePage\(/)
  assert.match(qml, /SourceModel\.sourcePageRows\(/)
  assert.match(qml, /row\.kind === "source-toggle"/)
  assert.match(qml, /sourceConfig\.toggle\(row\.value\)/)
})

// -- Fresh: structural assertions for what the three post-plan fix waves
// added. Each pins text that really is in Runner.qml — not a regex loose
// enough to also match deliberately broken code.

test("the collapsed root skips computing a row-list height entirely", () => {
  // rowListHeight()'s early return. Deleting this line would make a
  // collapsed root still walk displayModel and return a nonzero height.
  assert.ok(qml.includes("if (root.collapsed) return 0"))
})

test("the card and row-list heights zero out while collapsed", () => {
  // visibleRowsHeight and cardHeight both gate on collapsed with this
  // ternary; losing either binding would let the empty root show a fold.
  const occurrences = qml.split("root.collapsed ? 0 :").length - 1
  assert.equal(occurrences, 2, "expected both visibleRowsHeight and cardHeight to gate on root.collapsed")
})

test("the row-area Item is hidden while collapsed", () => {
  // The Column's row-area Item; without this the collapsed root would still
  // reserve layout space for zero rows.
  assert.ok(qml.includes("visible: !root.collapsed"))
})

test("AppSource is instantiated alongside the other sources", () => {
  assert.match(qml, /AppSource\s*\{/)
})

test("bumpSerial and clearSources drive the source-search lifecycle", () => {
  // Renamed from the phase-1 plan's resetSources() during a fix wave; a
  // single search timer restart (bumpSerial) is now distinct from a full
  // cancel (clearSources) called on menu changes, cancel() and re-open.
  assert.match(qml, /function bumpSerial\(\)/)
  assert.match(qml, /function clearSources\(\)/)
  assert.equal(qml.includes("function resetSources("), false)
})

test("hasIcon covers image rows, not just glyph rows", () => {
  // Source and app rows draw an Image instead of a glyph Text, but they still
  // need the same icon gutter reserved. Losing the usesImage clause would
  // misalign every source/app row's label against menu rows.
  assert.ok(qml.includes("row.icon.length > 0 || row.usesImage"))
})

test("the guard script excludes source-toggle rows from bash evaluation", () => {
  // checked: "config" on a toggle row is a marker for refreshSourcePage(),
  // not a shell expression; handing it to guardScript would run "config" as
  // a command and clobber the toggle's checkmark with whatever that exits.
  assert.match(qml, /gentry\.kind !== "source-toggle"/)
})
