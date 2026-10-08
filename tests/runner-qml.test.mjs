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

test("the category column captions the first row of each section", () => {
  assert.match(qml, /root\.sectionLabels\[/)
  assert.ok(qml.includes("row.ListView.previousSection !== row.ListView.section"))
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
  assert.ok(qml.includes("!RunnerModel.isConfigRow(gentry)"))
})

// -- KRunner/COSMIC layout (spec 2026-09-24-omarunner-krunner-layout-design).

test("the card width is fixed on every route", () => {
  assert.match(qml, /property int cardWidth: Math\.min\(Style\.space\(root\.settings\.width\)/)
  assert.equal(qml.includes("Style.space(300)"), false)
})

test("rows are compact and the list caps at nine before folding", () => {
  assert.match(qml, /property int compactRowHeight:/)
  assert.match(qml, /property int maxVisibleRows: root\.settings\.rows/)
  assert.equal(qml.includes("detailRowHeight"), false)
})

test("the category column only exists for a root search", () => {
  assert.match(qml, /readonly property bool showCategories: root\.activeMenu === "root" && !root\.collapsed/)
  assert.match(qml, /property int categoryWidth:/)
})

test("Ctrl+1 through Ctrl+9 activate the matching row with modifiers", () => {
  assert.match(qml, /function quickLaunchIndex\(event\)/)
  assert.ok(qml.includes("if (event.key >= Qt.Key_1 && event.key <= Qt.Key_9) return event.key - Qt.Key_1"))
  assert.ok(qml.includes("Qt.Key_Exclam"), "Ctrl+Shift+1 arrives as Key_Exclam")
  assert.ok(qml.includes("root.activateIndex(quick, false, event.modifiers)"))
})

test("rows 1 to 9 show their Ctrl shortcut", () => {
  assert.ok(qml.includes('root.settings.hints && row.index < 9 ? "Ctrl+" + (row.index + 1) : ""'))
})

test("the filter button and Ctrl+comma open the Sources page", () => {
  assert.match(qml, /function toggleSourcesPage\(\)/)
  assert.ok(qml.includes("event.key === Qt.Key_Comma"))
  assert.match(qml, /id: filterButton[\s\S]*?onClicked: root\.toggleSourcesPage\(\)/)
})

test("text is scaled locally, never through the shell's font tokens", () => {
  assert.match(qml, /property real fontScale: root\.settings\.fontScale \/ 100/)
  const direct = qml.match(/Style\.font\.(body|bodySmall|caption|title|heading|displayLarge)\b/g) || []
  assert.deepEqual(direct.sort(), ["Style.font.body", "Style.font.bodySmall", "Style.font.caption",
    "Style.font.displayLarge", "Style.font.heading", "Style.font.title"])
})

test("the Sources page lists Applications and Omarchy ahead of the sources", () => {
  assert.ok(qml.includes('{ sourceId: "apps", groupLabel: "Applications", hint: "Installed apps" }'))
  assert.ok(qml.includes('{ sourceId: "menu", groupLabel: "Omarchy", hint: "Omarchy menu entries" }'))
  assert.match(qml, /root\.sourceGroups\(\), root\.hiddenGroups\(\), root\.settings\.fuzzy\)/)
})

// -- More sources.

const SOURCE_FILES = ["CalcSource.qml", "LocationSource.qml", "CommandSource.qml", "KillSource.qml",
  "ClipboardSource.qml", "RecentSource.qml", "FileSource.qml", "FolderSource.qml", "WindowSource.qml", "WebSource.qml"]

test("every source file implements the source interface", async () => {
  for (const file of SOURCE_FILES) {
    const src = await readFile(join(root, file), "utf8")
    for (const needle of ["property string sourceId", "property string groupLabel", "property int maxRows",
      "property bool enabled", "function search(", "function activate(", "signal results("]) {
      assert.ok(src.includes(needle), `${file} missing ${needle}`)
    }
  }
})

test("sources built from user text run argv, never a shell string", async () => {
  for (const file of ["CalcSource.qml", "CommandSource.qml", "KillSource.qml", "ClipboardSource.qml", "FolderSource.qml",
    "WindowSource.qml", "WebSource.qml"]) {
    const src = await readFile(join(root, file), "utf8")
    assert.ok(src.includes("Util.execArgv("), `${file} should use Util.execArgv`)
    assert.equal(src.includes("Util.execDetached("), false, `${file} should not use Util.execDetached`)
  }
})

test("prefix sources claim their queries; leading sources lead", async () => {
  for (const file of ["CommandSource.qml", "KillSource.qml", "ClipboardSource.qml"]) {
    assert.ok((await readFile(join(root, file), "utf8")).includes("function claims("), file)
  }
  for (const file of ["CalcSource.qml", "LocationSource.qml"]) {
    assert.ok((await readFile(join(root, file), "utf8")).includes("property bool leading: true"), file)
  }
})

test("the runner registers every source and gives claimed queries to their source alone", () => {
  assert.ok(qml.includes("property var sources: [calcSource, locationSource, commandSource, killSource, clipboardSource, windowSource, folderSource, fileSource, recentSource, webSource]"))
  for (const type of ["CalcSource", "LocationSource", "CommandSource", "KillSource", "ClipboardSource", "RecentSource", "FolderSource", "WindowSource", "WebSource"]) {
    assert.match(qml, new RegExp(type + "\\s*\\{"))
  }
  assert.match(qml, /function sourceClaims\(source, query\)/)
  assert.ok(qml.includes("leading: s.leading === true, exclusive: claimsNow"))
  assert.ok(qml.includes("rows: prefixOnly && !claimsNow ? [] : (root.sourceRows[s.sourceId] || [])"))
  assert.ok(qml.includes("RunnerModel.withSessionAliases(mergedMenu.items)"))
  assert.ok(qml.includes('{ sourceId: "session", groupLabel: "Session", hint: "lock · sleep · restart · power off" }'))
})

// -- Settings page and fuzzy matching.

test("the gear button and Ctrl+S open the Settings page", () => {
  assert.match(qml, /function toggleSettingsPage\(\)/)
  assert.ok(qml.includes("event.key === Qt.Key_S"))
  assert.match(qml, /id: gearButton[\s\S]*?onClicked: root\.toggleSettingsPage\(\)/)
})

test("layout values come from the resolved settings", () => {
  assert.ok(qml.includes("readonly property var settings: SettingsModel.resolve(sourceConfig.config)"))
  assert.ok(qml.includes('Border.surfaceSpec("menu", "border", border, root.settings.border)'))
  assert.ok(qml.includes("Style.space(root.settings.density)"))
  assert.ok(qml.includes("root.settings.categories"))
})

test("the Settings page is injected and its rows write the config", () => {
  assert.ok(qml.includes("SettingsModel.pageRows(SettingsModel.resolve(sourceConfig.config),"))
  assert.ok(qml.includes("sourceConfig.apply(SettingsModel.applyOption(sourceConfig.config, row.value))"))
  assert.ok(qml.includes("sourceConfig.apply(SettingsModel.toggled(sourceConfig.config, row.value))"))
})

test("fuzzy reaches the files and recent sources", async () => {
  assert.match(qml, /FileSource \{\s*id: fileSource\s*fuzzy: root\.settings\.fuzzy/)
  assert.match(qml, /RecentSource \{\s*id: recentSource\s*fuzzy: root\.settings\.fuzzy/)
  const files = await readFile(join(root, "FileSource.qml"), "utf8")
  assert.ok(files.includes("FileModel.fzfArgs(query, root.home)"))
  assert.ok(files.includes('command: ["sh", "-c", "command -v fzf"]'))
})

test("text follows the chosen font while glyphs stay on the menu font", () => {
  assert.ok(qml.includes("readonly property string textFamily: root.settings.fontFamily || root.fontFamily"))
  assert.ok((qml.match(/font\.family: root\.textFamily/g) || []).length >= 6)
})

test("every source has a hint for the Sources page, shown without a query", async () => {
  for (const file of SOURCE_FILES) {
    assert.match(await readFile(join(root, file), "utf8"), /property string hint: "[^"]+"/, file)
  }
  assert.ok(qml.includes('(root.filterText || row.kind === "source-toggle" || row.kind === "setting-custom") && row.detail.length > 0'))
})

test("category captions, details and Ctrl+N hints use the Hint size setting", () => {
  assert.ok(qml.includes("root.fontBody * root.settings.hintScale / 100"))
  assert.equal((qml.match(/font\.pixelSize: root\.fontHint/g) || []).length, 3)
})

test("a second press of either page button closes its page", () => {
  assert.ok(qml.includes('if (root.inPage(page)) { root.closePage(page); return }'))
  assert.ok(qml.includes('return root.activeMenu === page || root.activeMenu.indexOf(page + ".") === 0'))
  assert.ok(qml.includes('root.closePage(page === "sources" ? "omarunner-settings" : "sources")'))
})

test("typing on a setting's page offers the typed value", () => {
  assert.ok(qml.includes("SettingsModel.customDisplayRow(root.activeMenu, root.filterText)"))
  assert.ok(qml.includes('row.kind === "setting-custom"'))
})

test("Sources page hints line up in a column after a hairline", () => {
  assert.ok(qml.includes('width: row.kind === "source-toggle" ? Math.min(root.sourceNameWidth, parent.width)'))
  assert.match(qml, /id: hintRule[\s\S]*?visible: row\.kind === "source-toggle" && row\.detail\.length > 0/)
})

test("pointer clicks pass their modifiers", () => {
  assert.ok(qml.includes("root.activateIndex(row.index, true, mouse.modifiers)"))
})

test("fallback sources reach buildRows and web search uses the configured URL", () => {
  assert.ok(qml.includes("fallback: s.fallback === true"))
  assert.match(qml, /WebSource \{\s*id: webSource\s*searchUrl: sourceConfig\.config\.webSearchUrl/)
})

test("opacity and corner radius come from the settings", () => {
  assert.ok(qml.includes("Color.menu.background.a * root.settings.opacity / 100"))
  assert.ok(qml.includes("root.settings.radius >= 0 ? Style.space(root.settings.radius) : Style.cornerRadius"))
})

test("the prefix-only guard spares fallback sources like Web", () => {
  assert.ok(qml.includes('var prefixOnly = typeof s.claims === "function" && s.fallback !== true'))
})

test("group dividers live in the row, not in ListView section delegates", () => {
  assert.equal(qml.includes("section.delegate"), false)
  assert.ok(qml.includes("height: root.baseRowHeight + row.gapAbove"))
  assert.ok(qml.includes('elide: row.kind === "source-toggle" || row.kind === "setting-custom" ? Text.ElideRight : Text.ElideMiddle'))
})

test("the typed Use row follows the matching presets; Custom… applies a typed value", () => {
  const append = qml.indexOf("for (var k = 0; k < built.rows.length; k++) displayModel.append(built.rows[k])")
  const typed = qml.indexOf("var typed = SettingsModel.customDisplayRow(root.activeMenu, root.filterText)")
  assert.ok(append >= 0 && typed > append)
  assert.ok(qml.includes("var typedValue = SettingsModel.customDisplayRow(root.activeMenu, root.filterText)"))
})

test("the Settings and Sources pages are labelled as omarunner's own", () => {
  assert.ok(qml.includes('label: "Omarunner Settings",\n      title: "Omarunner Settings"'))
  assert.ok(qml.includes('label: "Omarunner Sources",\n      title: "Omarunner Sources"'))
})

test("Sources and Settings rows show ON/OFF badges and radio dots, driven by checkedResults", () => {
  assert.match(qml, /component RadioDot: Item/)
  assert.ok(qml.includes("root.accent"))
  assert.match(qml, /StateBadge \{\s*visible: row\.kind === "source-toggle"/)
  assert.ok(qml.includes('row.kind === "setting-option" || row.kind === "setting-custom"'))
  assert.ok(qml.includes("root.checkedResults[row.itemId] === true"))
})

test("Settings toggles show the badge after the name; Sources toggles at the right edge", () => {
  assert.match(qml, /component StateBadge: Item/)
  assert.match(qml, /StateBadge \{\s*visible: row\.kind === "setting-toggle"/)
  assert.equal(qml.includes('row.kind === "source-toggle" || row.kind === "setting-toggle"'), false)
})

test("the chevron's space is reserved on every row so Ctrl+N hints line up", () => {
  assert.ok(qml.includes('visible: row.kind !== "source-toggle"'))
  assert.ok(qml.includes('opacity: row.kind === "menu" || row.kind === "link" ? 0.36 : 0'))
})

test("edge padding is tight: card inset 4, row insets 4 left and 6 right", () => {
  assert.ok(qml.includes("property int contentMargin: Style.space(4)"))
  assert.ok(qml.includes("root.rowReservedBorderRight + Style.space(6)"))
  assert.ok(qml.includes("root.rowReservedBorderLeft + Style.space(4)"))
})

test("the Settings page passes the keybinding wizard command to its Keybindings… row", () => {
  assert.ok(qml.includes("omarchy-launch-floating-terminal-with-presentation \" + Util.shellQuote(setup)"))
  assert.ok(qml.includes("videinfra.omarunner/bin/omarunner-setup"))
})

test("recent files are checked for existence before they are offered", async () => {
  const src = await readFile(join(root, "RecentSource.qml"), "utf8")
  assert.ok(src.includes("RecentModel.existsArgs("))
  assert.ok(src.includes("RecentModel.keepExisting(root.parsed, output)"))
})

test("Escape on the Sources or Settings page goes back instead of closing", () => {
  assert.ok(qml.includes('else if (root.inPage("sources") || root.inPage("omarunner-settings")) root.goBack()'))
})

test("a source that also answers unprefixed queries is exempt from the prefix guard", async () => {
  assert.ok(qml.includes("s.alsoUnprefixed !== true"))
  assert.ok((await readFile(join(root, "RecentSource.qml"), "utf8")).includes("property bool alsoUnprefixed: true"))
})

test("the accent colour comes from the Accent setting and colours the highlights", () => {
  assert.match(qml, /AccentSource \{\s*id: accentSource\s*choice: root\.settings\.accent/)
  assert.ok(qml.includes("readonly property color accent: accentSource.value"))
  assert.equal(qml.includes("Color.accent"), false)
  assert.ok(qml.includes('property color selectedText: root.settings.accent === "theme" ? Color.menu.selectedText : root.accent'))
  assert.ok(qml.includes('row.value.indexOf("accent=") === 0'))
})

test("the version pill and GitHub icon sit in the header beside the gear, on the Settings page only", () => {
  assert.ok(qml.includes("id: aboutBox"))
  assert.ok(qml.includes('visible: root.settings.about && root.version !== "" && gearButton.active'))
  assert.ok(qml.includes("https://github.com/thevideinfra/omarunner"))
  assert.ok(qml.includes("anchors.right: aboutBox.visible ? aboutBox.left : gearButton.left"))
  assert.ok(qml.includes("root.fileVersion || String(root.manifest && root.manifest.version"))
  assert.ok(qml.includes('Qt.resolvedUrl("manifest.json")'))
  assert.equal(qml.includes("var about = {"), false)
})

test("choosing Custom… switches the page into a typing mode that shows it", () => {
  assert.ok(qml.includes("property bool customEditing: false"))
  assert.ok(qml.includes('readonly property bool editingCustom: root.customEditing && root.activeMenu.indexOf("omarunner-settings.") === 0'))
  // Selecting the row turns it on; leaving the page or closing turns it off.
  assert.match(qml, /row\.kind === "setting-custom"[\s\S]*?root\.customEditing = true/)
  assert.match(qml, /function setActiveMenu[\s\S]*?root\.customEditing = false/)
  assert.match(qml, /function cancel\(\)[\s\S]*?customEditing = false/)
  // The header asks for the value, with a blinking accent caret; the row shows an input box.
  assert.ok(qml.includes("id: headerText"))
  assert.ok(qml.includes("id: headerCaret"))
  assert.ok(qml.includes("SettingsModel.customHint(root.activeMenu.slice("))
  assert.ok(qml.includes("id: customInput"))
  assert.ok(qml.includes('row.kind === "setting-custom" && root.editingCustom'))
})

test("the Sources and Settings pages show chevrons where the list scrolls", () => {
  assert.ok(qml.includes('readonly property bool pageScrollHints: root.inPage("sources") || root.inPage("omarunner-settings")'))
  assert.ok(qml.includes("id: scrollUpChevron"))
  assert.ok(qml.includes("id: scrollDownChevron"))
  assert.equal((qml.match(/visible: root\.pageScrollHints/g) || []).length, 2)
})
