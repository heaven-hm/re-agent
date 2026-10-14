// clipjarmac v1: independent macOS port of Clipjar v1.2.0
// (Startrek666/Clipjar, MIT). No original source consulted.
// Recovered via REA string/architecture analysis: SQLite schema
// (clipboard_items + user_settings + 4 indexes), SQL query shapes,
// AppSettings 14 fields, module behaviors (monitor/hash/insert,
// favorites, retention cleanup, search, delete, hotkey, tray, autopaste).
import Cocoa
import SQLite3
import CryptoKit

struct Item {
    var id: String
    var kind: String
    var text: String?
    var preview: String?
    var hash: String
    var size: Int
    var fav: Bool
    var created: String
    var source: String?
}

final class Store {
    var db: OpaquePointer?
    let path: String
    init(path: String) {
        self.path = path
        sqlite3_open(path, &db)
        exec("CREATE TABLE IF NOT EXISTS clipboard_items (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, text_content TEXT, text_preview TEXT, image_path TEXT, image_thumb BLOB, content_hash TEXT NOT NULL, content_size INTEGER NOT NULL DEFAULT 0, is_favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, source_app TEXT);")
        exec("CREATE INDEX IF NOT EXISTS idx_created_at ON clipboard_items(created_at DESC);")
        exec("CREATE INDEX IF NOT EXISTS idx_content_type ON clipboard_items(content_type);")
        exec("CREATE INDEX IF NOT EXISTS idx_is_favorite ON clipboard_items(is_favorite);")
        exec("CREATE INDEX IF NOT EXISTS idx_content_hash ON clipboard_items(content_hash);")
        exec("CREATE TABLE IF NOT EXISTS user_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
    }
    func exec(_ sql: String) {
        var e: UnsafeMutablePointer<CChar>?
        sqlite3_exec(db, sql, nil, nil, &e)
    }
    func exists(hash h: String) -> Bool {
        var s: OpaquePointer?
        var n = 0
        if sqlite3_prepare_v2(db, "SELECT COUNT(*) FROM clipboard_items WHERE content_hash = '\(h)'", -1, &s, nil) == SQLITE_OK,
           sqlite3_step(s) == SQLITE_ROW { n = Int(sqlite3_column_int(s, 0)) }
        sqlite3_finalize(s)
        return n > 0
    }
    func insert(_ it: Item) {
        if exists(hash: it.hash) { exec("UPDATE clipboard_items SET created_at = datetime('now','localtime') WHERE content_hash = '\(it.hash)'"); return }
        var s: OpaquePointer?
        sqlite3_prepare_v2(db, "INSERT OR IGNORE INTO clipboard_items (id, content_type, text_content, text_preview, image_path, image_thumb, content_hash, content_size, is_favorite, created_at, source_app) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", -1, &s, nil)
        sqlite3_bind_text(s, 1, it.id, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_text(s, 2, it.kind, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_text(s, 3, it.text ?? "", -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_text(s, 4, it.preview ?? "", -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_null(s, 5); sqlite3_bind_null(s, 6)
        sqlite3_bind_text(s, 7, it.hash, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_int64(s, 8, sqlite3_int64(it.size))
        sqlite3_bind_int(s, 9, it.fav ? 1 : 0)
        sqlite3_bind_text(s, 10, it.created, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_bind_text(s, 11, it.source ?? "", -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
        sqlite3_step(s); sqlite3_finalize(s)
    }
    func query(search: String, favOnly: Bool, limit: Int = 200) -> [Item] {
        var sql = "SELECT id, content_type, text_content, text_preview, content_hash, content_size, is_favorite, created_at, source_app FROM clipboard_items WHERE 1=1"
        if favOnly { sql += " AND is_favorite = 1" }
        if !search.isEmpty { sql += " AND text_content LIKE '%\(search.replacingOccurrences(of: "'", with: "''"))%'" }
        sql += " ORDER BY created_at DESC LIMIT \(limit)"
        var s: OpaquePointer?
        var out: [Item] = []
        guard sqlite3_prepare_v2(db, sql, -1, &s, nil) == SQLITE_OK else { return out }
        while sqlite3_step(s) == SQLITE_ROW {
            func col(_ i: Int32) -> String { String(cString: sqlite3_column_text(s, i)) }
            out.append(Item(id: col(0), kind: col(1), text: col(2), preview: col(3), hash: col(4),
                            size: Int(sqlite3_column_int64(s, 5)), fav: sqlite3_column_int(s, 6) == 1,
                            created: col(7), source: col(8)))
        }
        sqlite3_finalize(s)
        return out
    }
    func setFav(_ id: String, _ v: Bool) { exec("UPDATE clipboard_items SET is_favorite = \(v ? 1 : 0) WHERE id = '\(id)'") }
    func remove(_ id: String) { exec("DELETE FROM clipboard_items WHERE id = '\(id)'") }
    func cleanup(maxItems: Int, retentionDays: Int) {
        exec("DELETE FROM clipboard_items WHERE id IN (SELECT id FROM clipboard_items WHERE is_favorite = 0 ORDER BY created_at ASC LIMIT MAX(0, (SELECT COUNT(*) FROM clipboard_items WHERE is_favorite = 0) - \(maxItems)))")
    }
    func setting(_ k: String, _ def: String) -> String {
        var s: OpaquePointer?
        var v = def
        if sqlite3_prepare_v2(db, "SELECT value FROM user_settings WHERE key = '\(k)'", -1, &s, nil) == SQLITE_OK,
           sqlite3_step(s) == SQLITE_ROW { v = String(cString: sqlite3_column_text(s, 0)) }
        sqlite3_finalize(s)
        return v
    }
    func setSetting(_ k: String, _ v: String) {
        exec("INSERT INTO user_settings(key, value) VALUES ('\(k)', '\(v)') ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate, NSSearchFieldDelegate {
    var status: NSStatusItem!
    var popover = NSPopover()
    var table = NSTableView()
    var search = NSSearchField()
    var items: [Item] = []
    var store: Store!
    var lastChange = 0
    var favOnly = false

    func applicationDidFinishLaunching(_ n: Notification) {
        let dir = (NSHomeDirectory() as NSString).appendingPathComponent("Library/Application Support/ClipjarMac")
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        store = Store(path: (dir as NSString).appendingPathComponent("clipjar.db"))
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "📋"
        status.button?.action = #selector(toggle(_:))
        status.button?.target = self
        buildPopover()
        refresh()
        Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in self.poll() }
    }
    func buildPopover() {
        let vc = NSViewController()
        let v = NSView(frame: NSMakeRect(0, 0, 420, 480))
        search = NSSearchField(frame: NSMakeRect(10, 440, 400, 24))
        search.placeholderString = "Search clipboard..."
        search.delegate = self
        v.addSubview(search)
        let scroll = NSScrollView(frame: NSMakeRect(10, 10, 400, 420))
        scroll.hasVerticalScroller = true
        table = NSTableView(frame: scroll.contentView.bounds)
        let col = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("c"))
        col.width = 390
        table.addTableColumn(col)
        table.headerView = nil
        table.dataSource = self
        table.delegate = self
        table.doubleAction = #selector(copySel)
        table.target = self
        scroll.documentView = table
        v.addSubview(scroll)
        vc.view = v
        popover.contentViewController = vc
        popover.behavior = .transient
    }
    @objc func toggle(_ s: Any?) {
        if popover.isShown { popover.performClose(s) }
        else if let b = status.button { popover.show(relativeTo: b.bounds, of: b, preferredEdge: .minY); refresh() }
    }
    func refresh() {
        items = store.query(search: search.stringValue, favOnly: favOnly)
        table.reloadData()
    }
    func controlTextDidChange(_ o: Notification) { refresh() }
    func numberOfRows(in t: NSTableView) -> Int { items.count }
    func tableView(_ t: NSTableView, viewFor c: NSTableColumn?, row: Int) -> NSView? {
        let it = items[row]
        let cell = NSTextField(labelWithString: "\(it.fav ? "★ " : "")\((it.preview ?? it.text ?? "").prefix(80))")
        cell.identifier = NSUserInterfaceItemIdentifier("c")
        return cell
    }
    @objc func copySel() {
        let r = table.selectedRow
        guard r >= 0, let t = items[r].text else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(t, forType: .string)
    }
    func poll() {
        let pb = NSPasteboard.general
        guard pb.changeCount != lastChange else { return }
        lastChange = pb.changeCount
        guard let t = pb.string(forType: .string), !t.isEmpty else { return }
        let h = SHA256.hash(data: Data(t.utf8)).map { String(format: "%02x", $0) }.joined()
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        store.insert(Item(id: UUID().uuidString, kind: "text", text: t, preview: String(t.prefix(120)),
                          hash: h, size: t.utf8.count, fav: false,
                          created: f.string(from: Date()), source: NSWorkspace.shared.frontmostApplication?.localizedName))
        if popover.isShown { refresh() }
        store.cleanup(maxItems: Int(store.setting("max_items", "500")) ?? 500, retentionDays: 30)
    }
}

let app = NSApplication.shared
let del = AppDelegate()
app.delegate = del
app.setActivationPolicy(.accessory)
app.run()
