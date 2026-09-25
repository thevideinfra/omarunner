import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import qs.Commons
import qs.Ui
import "RunnerModel.js" as RunnerModel
import "SourceModel.js" as SourceModel
import "SettingsModel.js" as SettingsModel

Item {
  id: root

  // Injected by omarchy-shell when this plugin is summoned.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH")
  property var shell: null
  property var manifest: null

  // Plugin lifecycle hooks. The host calls open(payloadJson) after
  // `omarchy-shell shell summon videinfra.omarunner ...` and close() when hidden.
  property string pendingInitialMenu: "root"

  function open(payloadJson) {
    var payload = ({})
    try { payload = JSON.parse(payloadJson || "{}") } catch (e) { payload = ({}) }

    if (payload.fontFamily) root.fontFamily = payload.fontFamily

    root.openRoute(payload.initialMenu || payload.menu || "root")
  }

  function close() {
    root.cancel()
  }

  function refresh() {
    defaultMenuFile.reload()
    userMenuFile.reload()
    return "ok"
  }

  function ping() { return "ok" }

  property string fontFamily: Style.font.menuFamily
  // Settings page choices (omarunner.json "settings"), merged over defaults.
  readonly property var settings: SettingsModel.resolve(sourceConfig.config)
  // Text uses the chosen family; icon glyphs stay on the Nerd Font menu family.
  readonly property string textFamily: root.settings.fontFamily || root.fontFamily
  // omarunner draws its text smaller than the shell's type scale. Scaling
  // here keeps the system font settings untouched.
  property real fontScale: root.settings.fontScale / 100
  function scaledFont(px) { return Math.max(1, Math.round(px * root.fontScale)) }
  readonly property int fontCaption: scaledFont(Style.font.caption)
  readonly property int fontBodySmall: scaledFont(Style.font.bodySmall)
  readonly property int fontBody: scaledFont(Style.font.body)
  readonly property int fontTitle: scaledFont(Style.font.title)
  readonly property int fontHeading: scaledFont(Style.font.heading)
  readonly property int fontDisplayLarge: scaledFont(Style.font.displayLarge)
  // Category captions, row details, Sources hints and Ctrl+N hints:
  // Settings → Hint size, as a share of the row label size.
  // Name column on the Sources page, wide enough for "Applications ✓".
  readonly property int sourceNameWidth: Math.round(root.fontBody * 9)
  readonly property int fontHint: Math.max(1, Math.round(root.fontBody * root.settings.hintScale / 100))
  // JSONC menu definitions. The shell parses both at startup and merges
  // the user file on top of the defaults, so the keybind → IPC → visible
  // path doesn't have to shell out to bash + jq on every open.
  property string defaultMenuPath: omarchyPath + "/default/omarchy/omarchy-menu.jsonc"
  property string userMenuPath: Quickshell.env("HOME") + "/.config/omarchy/extensions/omarchy-menu.jsonc"
  property var defaultMenuItems: []
  property var userMenuItems: []
  property bool opened: false
  property bool rowsLoaded: false
  property string activeMenu: "root"
  property string filterText: ""
  property int selectedIndex: 0
  property bool cursorActive: false
  property var items: ({})
  property var itemOrder: []
  property var navStack: []
  property var providersLoaded: ({})
  property var providerQueue: []
  property int providerRevision: 0

  // Application engine (entries, hidden filters, icons, launch, removal). The
  // shell's shared AppLibrary is not reachable from a third-party menu plugin,
  // so the runner owns one; see AppModel.js.
  property bool deleteConfirmOpen: false
  property var deleteTarget: null
  onOpenedChanged: if (!opened) { deleteConfirmOpen = false; deleteTarget = null }
  // Bound to the central [menu] section in shell.toml via Color.qml.
  // Each color already includes its alpha companion (composed in the
  // singleton), so consumers can drop them straight into a Rectangle.
  // Settings → Opacity scales the card background's own alpha.
  property color background: Qt.rgba(Color.menu.background.r, Color.menu.background.g, Color.menu.background.b,
                                     Color.menu.background.a * root.settings.opacity / 100)
  property color foreground: Color.menu.text
  property color border: Color.menu.border
  property var borderSpec: Border.surfaceSpec("menu", "border", border, root.settings.border)
  property color scrim: Color.menu.scrim
  property color selectedBackground: Color.menu.selectedBackground
  property color selectedText: Color.menu.selectedText
  property color selectedBorder: Color.menu.selectedBorder
  property var selectedBorderSpec: Border.surfaceSpec("menu", "selected-border", selectedBorder, 0)
  readonly property real rowReservedBorderLeft: Border.left(selectedBorderSpec)
  readonly property real rowReservedBorderRight: Border.right(selectedBorderSpec)
  // Settings → Corner radius; -1 keeps the theme's radius.
  readonly property int cornerRadius: root.settings.radius >= 0 ? Style.space(root.settings.radius) : Style.cornerRadius
  property int contentMargin: Style.space(8)
  property int headerHeight: Math.max(Style.space(28), root.fontHeading + Style.space(8))
  property int contentSpacing: Style.space(4)
  // KRunner-style compact rows: label and detail share one line, so every
  // row is the same height and the list stays short.
  property int compactRowHeight: Math.max(Style.space(root.settings.density), root.fontBody + Style.space(10))
  property int baseRowHeight: compactRowHeight
  // Rows shown before the list folds and scrolls.
  property int maxVisibleRows: root.settings.rows
  // How much of the first hidden row stays visible at the fold — enough to
  // read as a cut-off row rather than a bottom border.
  property int rowPeek: Math.round(baseRowHeight * 0.55)
  property int rowSpacing: 0
  property int dividerHeight: Style.space(17)
  // Hairline gap between category groups in a root search.
  property int groupGapHeight: Style.space(5)
  // The KRunner category column: section captions right-aligned on the left.
  readonly property bool showCategories: root.activeMenu === "root" && !root.collapsed && root.settings.categories
  property int categoryWidth: root.showCategories ? Style.space(120) : 0
  property bool searchDivider: false
  property int layoutSerial: 0
  property var sources: [calcSource, locationSource, commandSource, killSource, clipboardSource, windowSource, folderSource, fileSource, recentSource, webSource]
  property var sourceRows: ({})
  property int searchSerial: 0
  property var sectionLabels: ({})
  // At the root with no query omarunner is a bare input line: no row area, and
  // no spacing under the header to hint at one.
  readonly property bool collapsed: root.activeMenu === "root" && !root.filterText.trim()
  property int cardWidth: Math.min(Style.space(root.settings.width), panel.width - Style.gapsOut * 2)
  property int visibleRowsHeight: root.collapsed ? 0 : rowListHeight(layoutSerial, displayModel.count, filterText, searchDivider)
  property int cardHeight: Math.min(contentMargin * 2 + headerHeight + (root.collapsed ? 0 : contentSpacing + visibleRowsHeight), panel.height - Style.gapsOut * 2)

  function runAction(action) {
    var command = String(action || "")
    if (!command) return

    Util.execDetached(command)
  }

  // Height of the divider drawn above the first row of a section.
  function sectionGapHeight(section) {
    if (section === "drilldown") return root.dividerHeight
    if (section.indexOf("group:") === 0 || section.indexOf("source:") === 0) return root.groupGapHeight
    return 0
  }

  // Height the card can devote to rows before running off the screen — or
  // past the frozen top edge once a search has pinned the card in place.
  // Uses panel.cardTop rather than effectiveCardTop: the centered top is
  // derived from the card height, which this value feeds.
  function availableRowsHeight() {
    var top = panel.cardTop >= 0 ? panel.cardTop : Style.gapsOut
    var available = panel.height - top - Style.gapsOut - root.contentMargin * 2 - root.headerHeight - root.contentSpacing
    // For a submenu, the starting menu sets the ceiling along with the offset:
    // drilling deeper scrolls behind the fold instead of growing the card. On
    // the root route the first freeze leaves maxRowsHeight at -1 for the rest
    // of the session (see panel.freezeCardTop), so this ceiling never engages
    // there and root searches grow by the screen budget alone.
    if (panel.maxRowsHeight >= 0) available = Math.min(available, panel.maxRowsHeight)
    // A card that swallows the whole screen reads as a page, not a menu.
    available = Math.min(available, Math.round(panel.height * 0.7))
    // Start short: past maxVisibleRows the list folds and scrolls.
    var rowsCap = root.maxVisibleRows * root.baseRowHeight + (root.maxVisibleRows - 1) * root.rowSpacing + root.rowPeek
    return Math.min(available, rowsCap)
  }

  // When every row fits, the list gets its full height. When they don't,
  // the card must end mid-row: a clipped row is what tells the eye there is
  // more below the fold, so never come out even on a row boundary.
  function foldedListHeight(totals, available) {
    var count = totals.length
    if (count === 0) return root.baseRowHeight
    if (totals[count - 1] <= available) return totals[count - 1]

    var peek = root.rowPeek
    var full = 0
    while (full < count && totals[full] <= available) full++
    while (full > 1 && totals[full - 1] + root.rowSpacing + peek > available) full--
    if (full < 1) return Math.max(available, root.baseRowHeight)

    return totals[full - 1] + root.rowSpacing + peek
  }

  function rowListHeight(_serial, _count, _filter, _divider) {
    if (root.collapsed) return 0
    if (displayModel.count === 0) return root.baseRowHeight

    var totals = []
    var total = 0
    var previousSection = ""

    for (var i = 0; i < displayModel.count; i++) {
      var row = displayModel.get(i)
      if (i > 0) total += root.rowSpacing
      // The first group of a root search gets no divider above it.
      if (i > 0 && previousSection !== row.section) total += root.sectionGapHeight(row.section)
      total += root.baseRowHeight
      previousSection = row.section
      totals.push(total)
    }

    return foldedListHeight(totals, availableRowsHeight())
  }

  function item(id) {
    return root.items[id] || null
  }

  // ------------------------------------------------------------------
  // JSONC → normalized item array. Mirrors the bash bin's jq pipeline so
  // the on-disk authoring format stays untouched.
  // ------------------------------------------------------------------

  function stripJsonc(raw) {
    return RunnerModel.stripJsonc(raw)
  }

  function normalizeAliases(value) {
    return RunnerModel.normalizeAliases(value)
  }

  function normalizeItem(id, raw) {
    return RunnerModel.normalizeItem(id, raw)
  }

  function parseMenuJsonc(raw) {
    return RunnerModel.parseMenuJsonc(raw)
  }

  // Merge defaults + user extension. Later entries override earlier ones
  // on a per-key basis (so the user can tweak label/icon/action without
  // re-declaring the whole row).
  function rebuildItemsFromSources() {
    var mergedMenu = RunnerModel.mergeMenuSources(root.defaultMenuItems, root.userMenuItems)
    root.providerRevision += 1
    root.providersLoaded = ({})
    root.providerQueue = []
    root.items = RunnerModel.withSessionAliases(mergedMenu.items)
    root.itemOrder = mergedMenu.itemOrder
    root.rowsLoaded = true
    root.evaluateGuards()
    root.refreshSourcePage()
    if (root.opened) {
      root.rebuildDisplay()
      if (root.filterText.trim()) root.loadProvidersForSearch()
      else root.loadProviderForMenu(root.activeMenu)
    }
  }

  // Each known provider is a tiny bash one-liner that enumerates a list and
  // emits one tab-delimited row per item: `label\tvalue\tcurrent`. The shell
  // turns those into menu items children of `menuId`. A `volatile` provider
  // re-runs every time its submenu is entered, so a font installed since the
  // shell started shows up without restarting it.
  readonly property var providers: ({
    "fonts": {
      script: "current=$(omarchy-font-current 2>/dev/null); omarchy-font-list 2>/dev/null | while read -r f; do [[ -z $f ]] && continue; printf '%s\\t%s\\t%s\\n' \"$f\" \"$f\" \"$current\"; done",
      icon: "",
      volatile: true,
      actionFor: function(value) { return "omarchy-font-set " + Util.shellQuote(value) }
    },
    "power-profiles": {
      script: "current=$(powerprofilesctl get 2>/dev/null); omarchy-powerprofiles-list 2>/dev/null | while read -r p; do [[ -z $p ]] && continue; printf '%s\\t%s\\t%s\\n' \"$p\" \"$p\" \"$current\"; done",
      icon: "\udb81\udc0b",
      actionFor: function(value) { return "omarchy-powerprofiles-set autodetect " + Util.shellQuote(value) }
    }
  })

  function slugify(value) {
    return RunnerModel.slugify(value)
  }

  // The apps provider is QML-native: rows come from AppSource (DesktopEntries)
  // instead of a bash enumeration, so they carry image icons and uninstall
  // support like the launcher.
  function mergeAppRows() {
    var appRows = appSource.rows()

    var merged = RunnerModel.mergeAppRows(root.items, root.itemOrder, appRows)
    root.items = merged.items
    root.itemOrder = merged.itemOrder
    if (root.opened) root.rebuildDisplay()
  }

  function startProviderForMenu(id) {
    var entry = root.item(id)
    if (!entry || !entry.provider || root.providersLoaded[id]) return
    if (entry.provider === "apps") {
      root.providersLoaded[id] = true
      root.mergeAppRows()
      return
    }
    var spec = root.providers[entry.provider]
    if (!spec) return

    root.providersLoaded[id] = true
    providerProc.menuId = id
    providerProc.providerKey = entry.provider
    providerProc.revision = root.providerRevision
    providerProc.collected = ""
    providerProc.command = ["bash", "-lc", spec.script]
    providerProc.running = true
  }

  function mergeProviderRows(rows, menuId, providerKey) {
    var spec = root.providers[providerKey]
    if (!spec) return
    var lines = String(rows || "").split("\n")
    var providerRows = []
    var takenIds = ({})
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      var parts = line.split("\t")
      var label = parts[0] || ""
      var value = parts[1] || parts[0] || ""
      var current = parts[2] || ""
      if (!label) continue
      // Distinct values can slugify alike — Fira Code and Fira-Code both give
      // fira-code — and a repeated id is dropped, which would silently lose a
      // row from the list. Nudge it until it is the row's own.
      var rowId = menuId + "." + root.slugify(value)
      while (takenIds[rowId]) rowId += "-"
      takenIds[rowId] = true

      providerRows.push({
        id: rowId,
        parent: menuId,
        kind: "action",
        icon: (value === current) ? "✓" : (spec.icon || ""),
        label: label,
        title: "",
        target: "",
        description: "",
        action: spec.actionFor(value),
        provider: "",
        aliases: [],
        when: "",
        checked: "",
        order: 0
      })
    }
    var merged = RunnerModel.swapProviderRows(root.items, root.itemOrder, menuId, providerRows)
    root.items = merged.items
    root.itemOrder = merged.itemOrder
    if (root.opened) root.rebuildDisplay()
  }

  function startNextProvider() {
    if (providerProc.running) return

    while (root.providerQueue.length > 0) {
      var id = root.providerQueue.shift()
      var entry = root.item(id)
      if (!entry || !entry.provider || root.providersLoaded[id]) continue

      root.startProviderForMenu(id)
      return
    }
  }

  // Entering a submenu is the one moment a volatile list is worth paying for
  // again: it may have been reshaped by the last pick from it. Search doesn't
  // invalidate, or every keystroke would restart the same enumeration.
  function invalidateVolatileProvider(id) {
    var entry = root.item(id)
    var spec = entry && entry.provider ? root.providers[entry.provider] : null
    if (spec && spec.volatile) root.providersLoaded[id] = false
  }

  function loadProviderForMenu(id) {
    var entry = root.item(id)
    if (!entry || !entry.provider || root.providersLoaded[id]) return

    // Native providers don't touch providerProc, so they never need to queue.
    if (entry.provider === "apps") {
      root.startProviderForMenu(id)
      return
    }

    if (providerProc.running) {
      if (root.providerQueue.indexOf(id) < 0) root.providerQueue = root.providerQueue.concat([id])
      return
    }

    root.startProviderForMenu(id)
  }

  function loadProvidersForSearch() {
    var active = root.item(root.activeMenu) ? root.activeMenu : "root"

    for (var i = 0; i < root.itemOrder.length; i++) {
      var entry = root.item(root.itemOrder[i])
      if (!entry || !entry.provider || root.providersLoaded[entry.id]) continue
      if (active !== "root" && entry.id !== active && !root.isDescendantOf(entry.id, active)) continue

      root.loadProviderForMenu(entry.id)
    }
  }

  function depthFor(id) {
    return RunnerModel.depthFor(root.items, id)
  }

  function pathFor(id) {
    return RunnerModel.pathFor(root.items, id)
  }

  function parentPathFor(id) {
    return RunnerModel.parentPathFor(root.items, id)
  }

  function isDescendantOf(id, ancestorId) {
    return RunnerModel.isDescendantOf(root.items, id, ancestorId)
  }

  function childCount(id) {
    return RunnerModel.childCount(root.items, root.itemOrder, id)
  }

  // Label with the ✓ marker baked in when `checked:` evaluated truthy.
  function labelFor(entry) {
    return RunnerModel.labelFor(entry, root.checkedResults)
  }

  function searchableToken(value) {
    return RunnerModel.searchableToken(value)
  }

  function leafIdFor(id) {
    return RunnerModel.leafIdFor(id)
  }

  function nameSearchText(entry) {
    return RunnerModel.nameSearchText(entry)
  }

  function termInSearchWords(term, text) {
    return RunnerModel.termInSearchWords(term, text)
  }

  function descriptionTextMatches(query, text) {
    return RunnerModel.descriptionTextMatches(query, text)
  }

  function rebuildDisplay() {
    displayModel.clear()

    if (!root.rowsLoaded) return

    var built = RunnerModel.buildRows(root.items, root.itemOrder, root.whenResults,
                                      root.checkedResults, root.activeMenu, root.filterText,
                                      root.sourceGroups(), root.hiddenGroups(), root.settings.fuzzy)
    root.activeMenu = built.activeMenu
    root.searchDivider = built.searchDivider
    root.sectionLabels = built.sectionLabels || ({})

    // On a setting's page, a typed value becomes a "Use …" row at the top.
    var typed = SettingsModel.customDisplayRow(root.activeMenu, root.filterText)
    if (typed) displayModel.append(typed)
    for (var k = 0; k < built.rows.length; k++) displayModel.append(built.rows[k])
    layoutSerial += 1

    if (displayModel.count === 0) selectedIndex = 0
    else if (selectedIndex >= displayModel.count) selectedIndex = displayModel.count - 1
    else if (selectedIndex < 0) selectedIndex = 0

    Qt.callLater(function() {
      if (displayModel.count > 0) root.revealCursor()
    })
  }

  // Contain alone parks the cursor row flush with the viewport edge, hiding
  // the neighbor entirely and losing the fold affordance. Keep the next
  // hidden row peeking past the cursor in the direction of travel.
  function revealCursor() {
    if (displayModel.count === 0) return
    resultList.positionViewAtIndex(root.selectedIndex, ListView.Contain)

    var item = resultList.itemAtIndex(root.selectedIndex)
    if (!item) return

    var reach = root.rowPeek + root.rowSpacing
    if (root.selectedIndex < displayModel.count - 1) {
      var maxY = Math.max(resultList.originY, resultList.originY + resultList.contentHeight - resultList.height)
      var overhang = item.y + item.height + reach - (resultList.contentY + resultList.height)
      if (overhang > 0) resultList.contentY = Math.min(resultList.contentY + overhang, maxY)
    }
    if (root.selectedIndex > 0) {
      var underhang = resultList.contentY - (item.y - reach)
      if (underhang > 0) resultList.contentY = Math.max(resultList.contentY - underhang, resultList.originY)
    }
  }

  function select(delta) {
    if (displayModel.count === 0) return

    root.disarmPointer()
    if (!cursorActive) {
      cursorActive = true
      selectedIndex = delta < 0 ? displayModel.count - 1 : 0
    } else {
      selectedIndex = (selectedIndex + delta + displayModel.count) % displayModel.count
    }
    revealCursor()
  }

  function setFilter(nextFilter) {
    panel.freezeCardTop()
    root.filterText = nextFilter
    // Typing keeps the current source rows on screen until the fresh reply
    // replaces them; the serial bump drops any reply for an older query.
    // Each source applies its own minimum query length.
    if (root.filterText.trim().length > 0 && root.activeMenu === "root") root.bumpSerial()
    else root.clearSources()
    root.selectedIndex = 0
    root.cursorActive = true
    root.disarmPointer()
    if (root.filterText.trim()) root.loadProvidersForSearch()
    root.rebuildDisplay()
  }

  function bumpSerial() {
    root.searchSerial += 1
    sourceTimer.restart()
  }

  function clearSources() {
    root.searchSerial += 1
    root.sourceRows = ({})
    sourceTimer.stop()
    for (var i = 0; i < root.sources.length; i++) if (root.sources[i].cancel) root.sources[i].cancel()
  }

  // A source whose prefix claims the query ("kill ", "cb ", ">") runs alone.
  function sourceClaims(source, query) {
    return source.enabled && typeof source.claims === "function" && source.claims(query)
  }

  function runSources() {
    var query = root.filterText.trim()
    if (!query || root.activeMenu !== "root") return
    var claimed = false
    for (var c = 0; c < root.sources.length; c++) if (root.sourceClaims(root.sources[c], query)) claimed = true
    for (var i = 0; i < root.sources.length; i++) {
      var s = root.sources[i]
      if (!s.enabled) continue
      if (claimed && !root.sourceClaims(s, query)) continue
      s.search(query, root.searchSerial)
    }
  }

  function acceptSourceRows(sourceId, serial, rows) {
    if (serial !== root.searchSerial) return
    var next = ({})
    for (var key in root.sourceRows) next[key] = root.sourceRows[key]
    next[sourceId] = rows
    root.sourceRows = next
    root.rebuildDisplay()
  }

  function sourceGroups() {
    var groups = []
    for (var i = 0; i < root.sources.length; i++) {
      var s = root.sources[i]
      if (!s.enabled) continue
      // A prefix-only source ("cb", "kill", ">") shows rows only while its
      // prefix is typed, even if an older reply is still stored. Web has a
      // prefix too but also answers unprefixed queries with its fallback row.
      var claimsNow = root.sourceClaims(s, root.filterText.trim())
      var prefixOnly = typeof s.claims === "function" && s.fallback !== true
      groups.push({ sourceId: s.sourceId, groupLabel: s.groupLabel, maxRows: s.maxRows,
        rows: prefixOnly && !claimsNow ? [] : (root.sourceRows[s.sourceId] || []),
        leading: s.leading === true, exclusive: claimsNow, fallback: s.fallback === true })
    }
    return groups
  }

  // Menu-tree groups the Sources page switched off, for buildRows.
  function hiddenGroups() {
    return { apps: !sourceConfig.isEnabled("apps"), menu: !sourceConfig.isEnabled("menu"), session: !sourceConfig.isEnabled("session") }
  }

  // Re-renders the virtual "Sources" menu (and its per-source toggle rows)
  // after a config change or a guard pass, so the ✓ marks stay in sync with
  // sourceConfig.config without ever asking bash to evaluate them.
  function refreshSourcePage() {
    var items = ({})
    var order = []
    for (var i = 0; i < root.itemOrder.length; i++) {
      var id = root.itemOrder[i]
      if (id === "sources" || id.indexOf("sources.") === 0 || id === "settings" || id.indexOf("settings.") === 0) continue
      items[id] = root.items[id]
      order.push(id)
    }
    items["sources"] = { id: "sources", parent: "root", kind: "menu", icon: "󰍉", iconFont: "", label: "Sources",
      title: "Sources", target: "", description: "Choose what omarunner searches", action: "", provider: "",
      aliases: ["search sources", "runner"], when: "", checked: "", order: order.length }
    order.push("sources")
    // Applications and Omarchy are built into buildRows, not registered
    // sources, but they toggle through the same config keys.
    var sourceList = [{ sourceId: "apps", groupLabel: "Applications", hint: "Installed apps" },
                      { sourceId: "menu", groupLabel: "Omarchy", hint: "Omarchy menu entries" },
                      { sourceId: "session", groupLabel: "Session", hint: "lock · sleep · restart · power off" }]
    for (var s = 0; s < root.sources.length; s++)
      sourceList.push({ sourceId: root.sources[s].sourceId, groupLabel: root.sources[s].groupLabel, hint: root.sources[s].hint || "" })
    var rows = SourceModel.sourcePageRows(sourceConfig.config, sourceList)
    var checked = ({})
    for (var k in root.checkedResults) checked[k] = root.checkedResults[k]
    for (var r = 0; r < rows.length; r++) {
      rows[r].order = order.length
      items[rows[r].id] = rows[r]
      order.push(rows[r].id)
      checked[rows[r].id] = sourceConfig.isEnabled(rows[r].value)
    }
    // The Settings page: preset submenus and toggles, ✓ from the config.
    items["settings"] = { id: "settings", parent: "root", kind: "menu", icon: "\uf013", iconFont: "", label: "Settings",
      title: "Settings", target: "", description: "Size, font, look and matching", action: "", provider: "",
      aliases: ["preferences", "omarunner settings"], when: "", checked: "", order: order.length }
    order.push("settings")
    // Resolved here, not via root.settings: this runs from onConfigChanged at
    // startup, before that binding has a value.
    var page = SettingsModel.pageRows(SettingsModel.resolve(sourceConfig.config))
    for (var p = 0; p < page.rows.length; p++) {
      page.rows[p].order = order.length
      items[page.rows[p].id] = page.rows[p]
      order.push(page.rows[p].id)
    }
    for (var pk in page.checked) checked[pk] = page.checked[pk]
    root.items = items
    root.itemOrder = order
    root.checkedResults = checked
    if (root.opened) root.rebuildDisplay()
  }

  function setActiveMenu(id, pushHistory, fromPointer) {
    panel.freezeCardTop()
    if (!root.item(id)) id = "root"
    if (pushHistory && id !== root.activeMenu) root.navStack = root.navStack.concat([root.activeMenu])
    root.activeMenu = id
    root.filterText = ""
    root.clearSources()
    root.selectedIndex = 0
    root.cursorActive = true
    if (fromPointer) pointerGate.allowInitialSample()
    else root.disarmPointer()
    root.rebuildDisplay()
    root.invalidateVolatileProvider(id)
    root.loadProviderForMenu(id)
  }

  // Ctrl+1…Ctrl+9 → row 0…8, else -1. With Shift held Qt reports the shifted
  // symbol (Key_Exclam for 1 on a US layout), so those map back too.
  function quickLaunchIndex(event) {
    if (!(event.modifiers & Qt.ControlModifier)) return -1
    if (event.key >= Qt.Key_1 && event.key <= Qt.Key_9) return event.key - Qt.Key_1
    var shifted = [Qt.Key_Exclam, Qt.Key_At, Qt.Key_NumberSign, Qt.Key_Dollar, Qt.Key_Percent,
                   Qt.Key_AsciiCircum, Qt.Key_Ampersand, Qt.Key_Asterisk, Qt.Key_ParenLeft]
    return (event.modifiers & Qt.ShiftModifier) ? shifted.indexOf(event.key) : -1
  }

  // Sources (filter button, Ctrl+,) and Settings (gear, Ctrl+S) toggle: a
  // second press closes the page, back to wherever it was opened from.
  function inPage(page) {
    return root.activeMenu === page || root.activeMenu.indexOf(page + ".") === 0
  }

  function closePage(page) {
    for (var guard = 0; guard < 16 && root.inPage(page); guard++) root.goBack()
  }

  function togglePage(page) {
    if (root.inPage(page)) { root.closePage(page); return }
    root.closePage(page === "sources" ? "settings" : "sources")
    root.setActiveMenu(page, true, false)
  }

  function toggleSettingsPage() { root.togglePage("settings") }

  function toggleSourcesPage() { root.togglePage("sources") }

  function goBack() {
    if (root.activeMenu === "root") return false

    if (root.navStack.length > 0) {
      var previous = root.navStack[root.navStack.length - 1]
      root.navStack = root.navStack.slice(0, root.navStack.length - 1)
      root.setActiveMenu(previous, false)
      return true
    }

    var active = root.item(root.activeMenu)
    root.setActiveMenu((active && active.parent) ? active.parent : "root", false)
    return true
  }

  function activateIndex(index, fromPointer, modifiers) {
    if (root.deleteConfirmOpen) return
    if (index < 0 || index >= displayModel.count) return

    var row = displayModel.get(index)
    if (row.kind === "menu" || row.kind === "link") {
      root.setActiveMenu(row.target || row.itemId, true, fromPointer)
    } else if (row.kind === "app") {
      var appId = row.appId
      var label = row.label
      opened = false
      filterText = ""
      appSource.launch(appId, label)
    } else if (row.kind === "source-toggle") {
      sourceConfig.toggle(row.value)
    } else if (row.kind === "setting-option") {
      // Pick, then return to the Settings page, whose row shows the new value.
      sourceConfig.apply(SettingsModel.applyOption(sourceConfig.config, row.value))
      root.goBack()
    } else if (row.kind === "setting-custom") {
      // Only a reminder; typing the value offers the row that applies it.
    } else if (row.kind === "setting-toggle") {
      sourceConfig.apply(SettingsModel.toggled(sourceConfig.config, row.value))
    } else if (row.kind === "source") {
      var source = null
      for (var i = 0; i < root.sources.length; i++) if (root.sources[i].sourceId === row.sourceId) source = root.sources[i]
      opened = false
      filterText = ""
      if (source) source.activate(row.value, modifiers || 0)
    } else {
      root.applySelected(row.itemId, row.action)
    }
  }

  function requestDeleteSelected() {
    if (!root.cursorActive || root.selectedIndex < 0 || root.selectedIndex >= displayModel.count) return
    var row = displayModel.get(root.selectedIndex)
    if (!row || row.kind !== "app") return
    root.deleteTarget = { appId: row.appId, label: row.label }
    deleteConfirm.selectedIndex = 1
    root.deleteConfirmOpen = true
  }

  function cancelDelete() {
    root.deleteConfirmOpen = false
    root.deleteTarget = null
    deleteConfirm.selectedIndex = 1
    root.disarmPointer()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  function confirmDelete() {
    var target = root.deleteTarget
    root.deleteConfirmOpen = false
    root.deleteTarget = null
    if (!target) return
    root.cancel()
    appSource.remove(target.appId, target.label)
  }

  function applySelected(id, action) {
    if (!id) { cancel(); return }

    opened = false
    filterText = ""
    root.runAction(action)
  }

  function cancel() {
    opened = false
    filterText = ""
    root.clearSources()
  }

  function openExistingMenu(initialMenu) {
    activeMenu = root.item(initialMenu) ? initialMenu : "root"
    navStack = []
    filterText = ""
    root.clearSources()
    selectedIndex = 0
    cursorActive = true
    root.disarmPointer()
    root.evaluateGuards()
    opened = true
    rebuildDisplay()
    invalidateVolatileProvider(activeMenu)
    loadProviderForMenu(activeMenu)

    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  AppSource {
    id: appSource
    omarchyPath: root.omarchyPath
  }

  SourceConfig {
    id: sourceConfig
    onConfigChanged: {
      for (var i = 0; i < root.sources.length; i++) {
        var s = root.sources[i]
        s.enabled = sourceConfig.isEnabled(s.sourceId)
      }
      root.refreshSourcePage()
    }
  }

  CalcSource {
    id: calcSource
    onResults: function(serial, rows) { root.acceptSourceRows(calcSource.sourceId, serial, rows) }
  }

  LocationSource {
    id: locationSource
    onResults: function(serial, rows) { root.acceptSourceRows(locationSource.sourceId, serial, rows) }
  }

  CommandSource {
    id: commandSource
    onResults: function(serial, rows) { root.acceptSourceRows(commandSource.sourceId, serial, rows) }
  }

  KillSource {
    id: killSource
    onResults: function(serial, rows) { root.acceptSourceRows(killSource.sourceId, serial, rows) }
  }

  ClipboardSource {
    id: clipboardSource
    onResults: function(serial, rows) { root.acceptSourceRows(clipboardSource.sourceId, serial, rows) }
  }

  WindowSource {
    id: windowSource
    onResults: function(serial, rows) { root.acceptSourceRows(windowSource.sourceId, serial, rows) }
  }

  WebSource {
    id: webSource
    searchUrl: sourceConfig.config.webSearchUrl || ""
    onResults: function(serial, rows) { root.acceptSourceRows(webSource.sourceId, serial, rows) }
  }

  FolderSource {
    id: folderSource
    fuzzy: root.settings.fuzzy
    onResults: function(serial, rows) { root.acceptSourceRows(folderSource.sourceId, serial, rows) }
  }

  RecentSource {
    id: recentSource
    fuzzy: root.settings.fuzzy
    onResults: function(serial, rows) { root.acceptSourceRows(recentSource.sourceId, serial, rows) }
  }

  FileSource {
    id: fileSource
    fuzzy: root.settings.fuzzy
    onResults: function(serial, rows) { root.acceptSourceRows(fileSource.sourceId, serial, rows) }
  }

  Timer {
    id: sourceTimer
    interval: 120
    onTriggered: root.runSources()
  }

  ListModel { id: displayModel }

  // ----------------------------------------------------------- route surface
  //
  // The menu is opened through the standard plugin lifecycle:
  // `omarchy-shell shell summon videinfra.omarunner '{"menu":"system"}'`.
  // Callers may pass a real id (`system`, `setup.power`) or an alias declared
  // in JSONC (`power`, `reminder-set`). Unknown strings fall through to the
  // id-as-route behavior so misspellings still attempt to open the literal id.
  function resolveRoute(input) {
    return RunnerModel.resolveRoute(root.items, root.itemOrder, input)
  }

  function openRoute(initialMenu) {
    var id = root.resolveRoute(initialMenu)
    var entry = root.items[id]
    // If the resolved id is an action (i.e. the user invoked an alias for
    // a leaf, e.g. `omarchy menu summon screenrecord-stop`), run it directly
    // instead of opening an action with no children.
    if (entry && entry.kind === "action" && entry.action) {
      root.cancel()
      root.runAction(entry.action)
      return "ok"
    }
    // If it's a link (a redirect to another menu), follow the link.
    if (entry && entry.kind === "link" && entry.target) id = entry.target
    root.pendingInitialMenu = id
    root.openExistingMenu(id)
    return "ok"
  }

  function disarmPointer() {
    pointerGate.reset()
  }

  function selectFromPointer(index, item, mouse) {
    if (!pointerGate.moved(item, mouse)) return
    root.cursorActive = true
    root.selectedIndex = index
  }

  Process {
    id: providerProc
    property string menuId: ""
    property string providerKey: ""
    property string collected: ""
    property int revision: 0
    stdout: SplitParser {
      onRead: function(data) { providerProc.collected += data + "\n" }
    }
    onExited: {
      if (providerProc.revision === root.providerRevision) {
        root.mergeProviderRows(providerProc.collected, providerProc.menuId, providerProc.providerKey)
        if (root.filterText.trim()) root.loadProvidersForSearch()
      }
      root.startNextProvider()
    }
  }

  PointerMoveGate {
    id: pointerGate
    referenceItem: card
  }

  Connections {
    target: appSource
    function onAppsChanged() {
      if (root.providersLoaded["apps"]) root.mergeAppRows()
    }
  }

  // The JSONC sources are watched so live edits to the default file (or the
  // user extension at ~/.config/omarchy/extensions/omarchy-menu.jsonc) take
  // effect without restarting the shell.
  FileView {
    id: defaultMenuFile
    path: root.defaultMenuPath
    watchChanges: true
    printErrors: false
    onLoaded: { root.defaultMenuItems = root.parseMenuJsonc(text()); root.rebuildItemsFromSources() }
    onFileChanged: reload()
  }

  FileView {
    id: userMenuFile
    path: root.userMenuPath
    watchChanges: true
    printErrors: false
    onLoaded: { root.userMenuItems = root.parseMenuJsonc(text()); root.rebuildItemsFromSources() }
    onLoadFailed: { root.userMenuItems = []; root.rebuildItemsFromSources() }
    onFileChanged: reload()
  }

  // ---------------------------------------------------------------- guards
  //
  // `when:` (visibility) and `checked:` (✓ marker) are bash expressions the
  // shell wasn't allowed to evaluate before the perf rewrite. Now the shell
  // batches them into one bash subprocess per (re)load so the open path
  // never has to wait on them.

  property var whenResults: ({})       // id → true|false (allow visibility)
  property var checkedResults: ({})    // id → true|false (show ✓)
  property bool guardsPending: false

  function evaluateGuards() {
    // Process ignores a command change while it is running, and `collected`
    // belongs to the run in flight, so a second evaluation cannot overwrite
    // the first: it would throw away the lines already read and never start.
    // The surviving tail then lands as the whole answer, and every id lost
    // with it goes back to showing, since a `when:` only hides on an explicit
    // false. Wait for the run in flight and evaluate once it lands instead.
    if (guardProc.running) {
      root.guardsPending = true
      return
    }
    root.guardsPending = false

    // Source-toggle rows carry `checked: "config"` as a marker for
    // refreshSourcePage() to read from sourceConfig, not a bash expression —
    // handing it to guardScript would run `config` as a shell command and
    // clobber the ✓ with whatever that exits.
    var guardItems = ({})
    for (var gid in root.items) {
      var gentry = root.items[gid]
      if (gentry && !RunnerModel.isConfigRow(gentry)) guardItems[gid] = gentry
    }
    var script = RunnerModel.guardScript(guardItems)
    if (!script) {
      root.whenResults = ({})
      root.checkedResults = ({})
      // Same as after a guard pass: put the source ✓ values back.
      root.refreshSourcePage()
      return
    }
    guardProc.collected = ""
    guardProc.command = ["bash", "-lc", script]
    guardProc.running = true
  }

  Process {
    id: guardProc
    property string collected: ""
    stdout: SplitParser {
      onRead: function(data) { guardProc.collected += data + "\n" }
    }
    onExited: function(exitCode, exitStatus) {
      // A batch that was killed rather than finished has only told us about
      // the rows it reached, and a row whose `when:` went unanswered shows.
      // Keep the last complete set rather than let a half-read one through.
      // A signal leaves the exit code at 0, so the status is what tells us.
      if (exitCode !== 0 || exitStatus !== 0) {
        if (root.guardsPending) Qt.callLater(function() { root.evaluateGuards() })
        return
      }

      var nextWhen = ({})
      var nextChecked = ({})
      var lines = guardProc.collected.split("\n")
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim()
        if (!line) continue
        var colon = line.lastIndexOf(":")
        if (colon < 0) continue
        var value = line.substring(colon + 1) === "1"
        var rest = line.substring(0, colon)
        var tagAt = rest.lastIndexOf(":")
        if (tagAt < 0) continue
        var id = rest.substring(0, tagAt)
        var tag = rest.substring(tagAt + 1)
        if (tag === "w") nextWhen[id] = value
        else if (tag === "c") nextChecked[id] = value
      }
      root.whenResults = nextWhen
      root.checkedResults = nextChecked
      // Source rows were excluded from the guard script above, so nextChecked
      // has nothing for them; merge their ✓ values back in from sourceConfig.
      // refreshSourcePage() rebuilds the display itself when opened.
      root.refreshSourcePage()
      // Run the evaluation that had to stand aside. Deferred by a turn so the
      // process is settled before its command is set again.
      if (root.guardsPending) Qt.callLater(function() { root.evaluateGuards() })
    }
  }
  PanelWindow {
    id: panel
    visible: root.opened && root.rowsLoaded
    anchors { top: true; bottom: true; left: true; right: true }
    color: "transparent"
    WlrLayershell.namespace: "omarchy-menu"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive
    exclusionMode: ExclusionMode.Ignore

    // The card opens centered exactly as always. The first search keystroke
    // or submenu move freezes the top line where it currently sits — from
    // then on the card grows and shrinks downward instead of re-centering
    // on every resize, which made the menu jump around. The rows height is
    // frozen at the same moment, so for a submenu the starting menu also caps
    // how tall the card may grow from there. On the root route that freeze
    // lands on collapsed (see below), so maxRowsHeight is pinned to -1 for
    // the rest of the session and the cap never engages. Closing unfreezes
    // both.
    property int cardTop: -1
    property int maxRowsHeight: -1
    readonly property int centeredTop: Math.max(Style.gapsOut, Math.round((height - root.cardHeight) / 2))
    readonly property int effectiveCardTop: cardTop >= 0 ? cardTop : centeredTop
    // A collapsed root has no rows to cap the card with, and freezing that
    // zero would hold the first search to a single row. Leave the ceiling
    // open in that case and let the screen budget alone decide.
    function freezeCardTop() {
      if (visible && cardTop < 0) {
        cardTop = effectiveCardTop
        maxRowsHeight = root.collapsed ? -1 : root.visibleRowsHeight
      }
    }
    onVisibleChanged: if (!visible) { cardTop = -1; maxRowsHeight = -1 }

    Rectangle {
      anchors.fill: parent
      color: root.scrim
    }

    MouseArea {
      anchors.fill: parent
      onClicked: root.cancel()
    }

    BorderSurface {
      id: card
      width: root.cardWidth
      height: Math.min(root.cardHeight, panel.height - Style.gapsOut - panel.effectiveCardTop)
      radius: root.cornerRadius
      anchors.horizontalCenter: parent.horizontalCenter
      y: panel.effectiveCardTop
      color: root.background
      borderSpec: root.borderSpec
      padding: root.contentMargin

      MouseArea { anchors.fill: parent; onClicked: {} }

      Item {
        id: keyCatcher
        anchors.fill: parent
        z: root.deleteConfirmOpen ? 20 : 0
        focus: true

        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          if (root.deleteConfirmOpen) {
            if (deleteConfirm.handleKey(event)) event.accepted = true
            return
          }

          if (root.quickLaunchIndex(event) >= 0) {
            // COSMIC-style quick launch; Shift still reaches a source's alternate action.
            var quick = root.quickLaunchIndex(event)
            if (quick < displayModel.count) {
              root.selectedIndex = quick
              root.cursorActive = true
              root.activateIndex(quick, false, event.modifiers)
            }
            event.accepted = true
          } else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_S) {
            root.toggleSettingsPage()
            event.accepted = true
          } else if ((event.modifiers & Qt.ControlModifier) && event.key === Qt.Key_Comma) {
            root.toggleSourcesPage()
            event.accepted = true
          } else if (event.key === Qt.Key_Delete) {
            root.requestDeleteSelected()
            event.accepted = true
          } else if (event.key === Qt.Key_Escape) {
            if (root.filterText) root.setFilter("")
            else root.cancel()
            event.accepted = true
          } else if (Util.editsFilter(event, root.filterText)) {
            root.setFilter(Util.editedFilter(event, root.filterText))
            event.accepted = true
          } else if ((event.key === Qt.Key_Backspace || event.key === Qt.Key_Left) && !root.filterText) {
            root.goBack()
            event.accepted = true
          } else if (event.key === Qt.Key_Up) {
            root.select(-1)
            event.accepted = true
          } else if (event.key === Qt.Key_Down) {
            root.select(1)
            event.accepted = true
          } else if (event.key === Qt.Key_PageUp) {
            root.select(-6)
            event.accepted = true
          } else if (event.key === Qt.Key_PageDown) {
            root.select(6)
            event.accepted = true
          } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Right) {
            if (root.cursorActive) root.activateIndex(root.selectedIndex, false, event.modifiers)
            else if (displayModel.count > 0) root.cursorActive = true
            event.accepted = true
          } else if (event.text && event.text.length === 1 && event.text.charCodeAt(0) >= 32 && event.text.charCodeAt(0) !== 127 && (event.modifiers === Qt.NoModifier || event.modifiers === Qt.ShiftModifier)) {
            root.setFilter(root.filterText + event.text)
            event.accepted = true
          }
        }

        ConfirmDialog {
          id: deleteConfirm

          anchors.fill: parent
          opened: root.deleteConfirmOpen
          z: 10
          message: "Do you want to uninstall " + ((root.deleteTarget && root.deleteTarget.label) || "") + "?"
          confirmText: "Uninstall"
          background: root.background
          foreground: root.foreground
          scrim: root.scrim
          selectedBackground: root.selectedBackground
          selectedText: root.selectedText
          fontFamily: root.fontFamily
          cornerRadius: root.cornerRadius
          onCanceled: root.cancelDelete()
          onConfirmed: root.confirmDelete()
        }
      }

      Column {
        anchors.fill: parent
        anchors.topMargin: card.contentTopInset
        anchors.rightMargin: card.contentRightInset
        anchors.bottomMargin: card.contentBottomInset
        anchors.leftMargin: card.contentLeftInset
        spacing: root.contentSpacing

        Rectangle {
          width: parent.width
          height: root.headerHeight
          radius: root.cornerRadius
          color: "transparent"

          // KRunner-style filter button: opens the Sources page.
          Rectangle {
            id: filterButton
            readonly property bool active: root.activeMenu === "sources"
            width: root.headerHeight
            height: root.headerHeight
            radius: root.cornerRadius
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            color: active ? root.selectedBackground : (filterMouse.containsMouse ? Util.alpha(root.foreground, 0.08) : "transparent")

            Text {
              anchors.centerIn: parent
              textFormat: Text.PlainText
              text: "\uf1de"
              color: filterButton.active ? root.selectedText : root.foreground
              opacity: filterButton.active || filterMouse.containsMouse ? 1 : 0.7
              font.family: root.fontFamily
              font.pixelSize: root.fontTitle
            }

            MouseArea {
              id: filterMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.toggleSourcesPage()
            }
          }

          Text {
            id: searchGlyph
            textFormat: Text.PlainText
            text: "\uf002"
            anchors.left: filterButton.right
            anchors.leftMargin: Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            color: root.foreground
            opacity: 0.45
            font.family: root.fontFamily
            font.pixelSize: root.fontBody
          }

          // Settings gear: size, font, look and fuzzy matching.
          Rectangle {
            id: gearButton
            readonly property bool active: root.activeMenu === "settings" || root.activeMenu.indexOf("settings.") === 0
            width: root.headerHeight
            height: root.headerHeight
            radius: root.cornerRadius
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            color: active ? root.selectedBackground : (gearMouse.containsMouse ? Util.alpha(root.foreground, 0.08) : "transparent")

            Text {
              anchors.centerIn: parent
              textFormat: Text.PlainText
              text: "\uf013"
              color: gearButton.active ? root.selectedText : root.foreground
              opacity: gearButton.active || gearMouse.containsMouse ? 1 : 0.7
              font.family: root.fontFamily
              font.pixelSize: root.fontTitle
            }

            MouseArea {
              id: gearMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: root.toggleSettingsPage()
            }
          }

          Text {
            textFormat: Text.PlainText
            anchors.left: searchGlyph.right
            anchors.leftMargin: Style.space(10)
            anchors.right: gearButton.left
            anchors.rightMargin: Style.space(8)
            anchors.verticalCenter: parent.verticalCenter
            text: root.filterText || ((root.activeMenu === "root")
              ? "Search…"
              : ((root.item(root.activeMenu) ? (root.item(root.activeMenu).title || root.item(root.activeMenu).label) : "Go") + "…"))
            color: root.foreground
            opacity: root.filterText ? 1 : 0.58
            font.family: root.textFamily
            font.pixelSize: root.fontHeading
            elide: Text.ElideRight
          }

        }

        Item {
          width: parent.width
          height: root.visibleRowsHeight
          visible: !root.collapsed

          ListView {
            id: resultList
            anchors.fill: parent
            model: displayModel
            clip: true
            spacing: root.rowSpacing
            boundsBehavior: Flickable.StopAtBounds

            section.property: "section"
            section.criteria: ViewSection.FullString
            delegate: Item {
              id: row
              required property int index
              required property string itemId
              required property string kind
              required property string icon
              required property string iconFont
              required property string appIcon
              required property string appId
              required property string label
              required property string target
              required property string detail
              required property string path
              required property string action
              required property string section
              required property int childCount

              readonly property bool hasCursor: root.cursorActive && row.index === root.selectedIndex
              readonly property bool isApp: row.kind === "app"
              // App and source rows draw an image; source rows without an
              // image path fall back to their themed icon name.
              readonly property bool usesImage: row.isApp || row.kind === "source"
              readonly property bool hasIcon: row.icon.length > 0 || row.usesImage
              readonly property int iconSize: Math.round(root.baseRowHeight * 0.6)
              // Group dividers are drawn inside the first row of each group,
              // never above the first row. (ListView section delegates left
              // stray lines behind when the model was rebuilt.)
              readonly property int gapAbove: row.index > 0 && row.ListView.previousSection !== row.section
                ? root.sectionGapHeight(row.section) : 0
              readonly property color textColor: row.hasCursor ? root.selectedText : root.foreground

              width: ListView.view.width
              height: root.baseRowHeight + row.gapAbove

              Rectangle {
                visible: row.gapAbove > 0
                x: Style.space(4)
                width: parent.width - Style.space(8)
                y: Math.round(row.gapAbove / 2)
                height: Style.spacing.hairline
                color: Util.alpha(root.foreground, 0.2)
              }

              // KRunner category column: the group caption, on the first row
              // of each section only.
              Text {
                id: categoryText
                textFormat: Text.PlainText
                visible: root.showCategories && row.ListView.previousSection !== row.ListView.section
                text: root.sectionLabels[row.section] || ""
                width: Math.max(0, root.categoryWidth - Style.space(12))
                anchors.left: parent.left
                anchors.verticalCenter: rowSurface.verticalCenter
                horizontalAlignment: Text.AlignRight
                color: root.foreground
                opacity: 0.6
                font.family: root.textFamily
                font.pixelSize: root.fontHint
                elide: Text.ElideLeft
              }

              BorderSurface {
                id: rowSurface
                anchors.left: parent.left
                anchors.leftMargin: root.categoryWidth
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: root.baseRowHeight
                radius: root.cornerRadius
                color: row.hasCursor ? root.selectedBackground : "transparent"
                borderSpec: row.hasCursor ? root.selectedBorderSpec : Border.none()

                Text {
                  id: iconText
                  textFormat: Text.PlainText
                  visible: row.hasIcon && !row.usesImage
                  text: row.icon
                  color: row.textColor
                  font.family: row.iconFont.length > 0 ? row.iconFont : root.fontFamily
                  font.pixelSize: row.iconSize
                  width: Style.space(28)
                  horizontalAlignment: Text.AlignHCenter
                  verticalAlignment: Text.AlignVCenter
                  anchors.left: parent.left
                  anchors.leftMargin: root.rowReservedBorderLeft + Style.space(6)
                  anchors.verticalCenter: parent.verticalCenter
                }

                Image {
                  id: appIconImage
                  visible: row.usesImage
                  width: row.iconSize
                  height: row.iconSize
                  fillMode: Image.PreserveAspectFit
                  // Decode at physical pixels — a logical-size decode leaves
                  // PNG icons upscaled and blurry on HiDPI displays.
                  sourceSize.width: width * Screen.devicePixelRatio
                  sourceSize.height: height * Screen.devicePixelRatio
                  source: row.isApp ? appSource.iconSource(row.appIcon)
                        : row.kind === "source" ? (row.appIcon ? row.appIcon : Quickshell.iconPath(row.icon, true)) : ""
                  asynchronous: true
                  anchors.left: parent.left
                  anchors.leftMargin: root.rowReservedBorderLeft + Style.space(6) + (Style.space(28) - width) / 2
                  anchors.verticalCenter: parent.verticalCenter
                }

                // Label, then the dimmed detail on the same line; the detail
                // elides first.
                Item {
                  id: contentLine
                  anchors.left: row.hasIcon ? iconText.right : parent.left
                  anchors.leftMargin: row.hasIcon ? Style.space(8) : root.rowReservedBorderLeft + Style.space(14)
                  anchors.right: trail.left
                  anchors.rightMargin: Style.space(8)
                  anchors.verticalCenter: parent.verticalCenter
                  height: labelText.implicitHeight

                  Text {
                    id: labelText
                    textFormat: Text.PlainText
                    // Sources page: names take a fixed column so the hints
                    // line up beside them, split by a hairline.
                    width: row.kind === "source-toggle" ? Math.min(root.sourceNameWidth, parent.width) : Math.min(implicitWidth, parent.width)
                    text: row.label
                    color: row.textColor
                    font.family: root.textFamily
                    font.pixelSize: root.fontBody
                    font.weight: Font.Medium
                    elide: Text.ElideRight
                  }

                  Rectangle {
                    id: hintRule
                    visible: row.kind === "source-toggle" && row.detail.length > 0
                    width: Style.spacing.hairline
                    height: labelText.height
                    anchors.left: labelText.right
                    anchors.leftMargin: Style.space(8)
                    anchors.verticalCenter: labelText.verticalCenter
                    color: Util.alpha(row.textColor, 0.25)
                  }

                  Text {
                    textFormat: Text.PlainText
                    anchors.left: hintRule.visible ? hintRule.right : labelText.right
                    anchors.leftMargin: hintRule.visible ? Style.space(8) : Style.space(10)
                    anchors.right: parent.right
                    anchors.baseline: labelText.baseline
                    text: row.detail
                    // Search results show their detail; the Sources page always
                    // shows each source's hint.
                    visible: (root.filterText || row.kind === "source-toggle" || row.kind === "setting-custom") && row.detail.length > 0 && width > Style.space(24)
                    color: row.textColor
                    opacity: 0.52
                    font.family: root.textFamily
                    font.pixelSize: root.fontHint
                    // Paths lose their middle; Sources hints read left to right.
                    elide: row.kind === "source-toggle" ? Text.ElideRight : Text.ElideMiddle
                  }
                }

                // COSMIC-style Ctrl+N hint, then the submenu chevron.
                Row {
                  id: trail
                  anchors.right: parent.right
                  anchors.rightMargin: root.rowReservedBorderRight + Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  spacing: Style.space(8)

                  Text {
                    textFormat: Text.PlainText
                    text: root.settings.hints && row.index < 9 ? "Ctrl+" + (row.index + 1) : ""
                    visible: text.length > 0
                    color: row.textColor
                    opacity: 0.45
                    font.family: root.textFamily
                    font.pixelSize: root.fontHint
                    anchors.verticalCenter: parent.verticalCenter
                  }

                  Text {
                    textFormat: Text.PlainText
                    text: "›"
                    visible: row.kind === "menu" || row.kind === "link"
                    color: row.textColor
                    opacity: 0.36
                    font.family: root.textFamily
                    font.pixelSize: root.fontHeading
                    anchors.verticalCenter: parent.verticalCenter
                  }
                }
              }

              MouseArea {
                id: mouseArea
                anchors.fill: rowSurface
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: root.selectFromPointer(row.index, rowSurface, {
                  x: mouseArea.mouseX,
                  y: mouseArea.mouseY
                })
                onPositionChanged: function(mouse) {
                  root.selectFromPointer(row.index, rowSurface, mouse)
                }
                // Modifiers pass through, so Shift+click works like Shift+Enter.
                onClicked: function(mouse) {
                  root.cursorActive = true
                  root.selectedIndex = row.index
                  root.activateIndex(row.index, true, mouse.modifiers)
                }
              }
            }
          }

          // Scroll scrims. The clipped row already marks the fold at rest;
          // these keep both edges honest once the list has been scrolled,
          // when content hides above the card top as well as below. Strength
          // tracks the distance still hidden past each edge rather than
          // animating on a clock, so a programmatic jump — wrapping from the
          // last row back to the first — lands with the fade already applied.
          Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            height: Math.min(Style.space(28), parent.height / 2)
            visible: opacity > 0
            opacity: resultList.contentHeight > resultList.height
              ? Math.max(0, Math.min(1, (resultList.contentY - resultList.originY) / height))
              : 0
            gradient: Gradient {
              GradientStop { position: 0; color: root.background }
              GradientStop { position: 1; color: Util.alpha(root.background, 0) }
            }
          }

          Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: Math.min(Style.space(28), parent.height / 2)
            visible: opacity > 0
            opacity: resultList.contentHeight > resultList.height
              ? Math.max(0, Math.min(1, (resultList.originY + resultList.contentHeight - resultList.height - resultList.contentY) / height))
              : 0
            gradient: Gradient {
              GradientStop { position: 0; color: Util.alpha(root.background, 0) }
              GradientStop { position: 1; color: root.background }
            }
          }

          Column {
            anchors.centerIn: parent
            spacing: Style.space(8)
            visible: displayModel.count === 0

            Text {
              text: "󰈉"
              color: root.selectedText
              opacity: 0.8
              font.family: root.fontFamily
              font.pixelSize: root.fontDisplayLarge
              horizontalAlignment: Text.AlignHCenter
              width: Style.space(320)
            }

            Text {
              textFormat: Text.PlainText
              text: root.filterText ? "No matches for “" + root.filterText + "”" : "Nothing here yet"
              color: root.foreground
              opacity: 0.7
              font.family: root.textFamily
              font.pixelSize: root.fontTitle
              horizontalAlignment: Text.AlignHCenter
              width: Style.space(320)
            }
          }
        }

        Item {
          width: parent.width
          height: 0
        }
      }
    }
  }
}
