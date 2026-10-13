// notepadmac v1: independent macOS port of legacy-notepad v1.2.1
// (ForLoopCodes/legacy-notepad, MIT). No original source consulted.
// Recovered via REA: NotepadClass/WndProc structure, full menu/shortcut
// table, Find&Replace, save-changes prompt, font persistence keys,
// dark-theme editor colors, drag-drop open, recent files, accelerators.
import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate, NSTextViewDelegate {
    var window: NSWindow!
    var textView: NSTextView!
    var fileURL: URL?
    var findPanel: NSPanel?
    var findField: NSTextField?
    var replaceField: NSTextField?
    var dark = false
    var recents: [String] {
        get { UserDefaults.standard.stringArray(forKey: "RecentFiles") ?? [] }
        set { UserDefaults.standard.set(newValue, forKey: "RecentFiles") }
    }

    func applicationDidFinishLaunching(_ n: Notification) {
        let style: NSWindow.StyleMask = [.titled, .closable, .miniaturizable, .resizable]
        window = NSWindow(contentRect: NSMakeRect(200, 200, 760, 520), styleMask: style, backing: .buffered, defer: false)
        window.title = "Untitled - Legacy Notepad (macOS port)"
        window.minSize = NSMakeSize(400, 300)
        let scroll = NSScrollView(frame: window.contentView!.bounds)
        scroll.autoresizingMask = [.width, .height]
        scroll.hasVerticalScroller = true
        textView = NSTextView(frame: scroll.contentView.bounds)
        textView.autoresizingMask = [.width, .height]
        textView.isRichText = false
        textView.usesFindBar = false
        textView.delegate = self
        if let name = UserDefaults.standard.string(forKey: "FontName"),
           let size = UserDefaults.standard.object(forKey: "FontSize") as? Double {
            textView.font = NSFont(name: name, size: CGFloat(size)) ?? .userFixedPitchFont(ofSize: 13)
        } else {
            textView.font = .userFixedPitchFont(ofSize: 13)
        }
        scroll.documentView = textView
        window.contentView?.addSubview(scroll)
        buildMenus()
        // open file from command line, like the original's cmdline open
        let args = CommandLine.arguments.dropFirst()
        if let first = args.first, FileManager.default.fileExists(atPath: first) {
            openFile(URL(fileURLWithPath: first))
        }
        // restore geometry
        if let fr = UserDefaults.standard.string(forKey: "WindowFrame"), let r = NSRectFromString(fr) as NSRect? {
            window.setFrame(r, display: false)
        }
        window.makeKeyAndOrderFront(nil)
        applyTheme()
        // drag-drop open
        window.registerForDraggedTypes([.fileURL])
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ n: Notification) {
        UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: "WindowFrame")
    }
    func textDidChange(_ n: Notification) {
        window.isDocumentEdited = true
        refreshTitle()
    }
    func refreshTitle() {
        let name = fileURL?.lastPathComponent ?? "Untitled"
        window.title = "\(name) - Legacy Notepad (macOS port)"
    }

    // MARK: menus (labels + shortcuts mirror the recovered table)
    func buildMenus() {
        let main = NSMenu()
        // File
        let fileM = NSMenuItem(); fileM.submenu = NSMenu(title: "File")
        addItem(fileM.submenu!, "New", "n", #selector(newDoc))
        addItem(fileM.submenu!, "Open...", "o", #selector(openDlg))
        addItem(fileM.submenu!, "Save", "s", #selector(saveDoc))
        let sa = NSMenuItem(title: "Save As...", action: #selector(saveAsDlg), keyEquivalent: "S")
        sa.keyEquivalentModifierMask = [.command, .shift]; fileM.submenu!.addItem(sa)
        addItem(fileM.submenu!, "Print...", "p", #selector(printDoc))
        fileM.submenu!.addItem(.separator())
        rebuildRecents(into: fileM.submenu!)
        main.addItem(fileM)
        // Edit
        let editM = NSMenuItem(); editM.submenu = NSMenu(title: "Edit")
        addItem(editM.submenu!, "Undo", "z", #selector(UndoManager.undo))
        editM.submenu!.addItem(.separator())
        addItem(editM.submenu!, "Cut", "x", #selector(NSText.cut(_:)))
        addItem(editM.submenu!, "Copy", "c", #selector(NSText.copy(_:)))
        addItem(editM.submenu!, "Paste", "v", #selector(NSText.paste(_:)))
        addItem(editM.submenu!, "Select All", "a", #selector(NSText.selectAll(_:)))
        editM.submenu!.addItem(.separator())
        addItem(editM.submenu!, "Find...", "f", #selector(showFind))
        let fn = NSMenuItem(title: "Find Next", action: #selector(findNext), keyEquivalent: "g")
        fn.keyEquivalentModifierMask = [.command]; editM.submenu!.addItem(fn)
        let fp = NSMenuItem(title: "Find Previous", action: #selector(findPrev), keyEquivalent: "G")
        fp.keyEquivalentModifierMask = [.command, .shift]; editM.submenu!.addItem(fp)
        addItem(editM.submenu!, "Replace...", "h", #selector(showReplace))
        editM.submenu!.addItem(.separator())
        addItem(editM.submenu!, "Font...", "t", #selector(showFonts))
        main.addItem(editM)
        // View
        let viewM = NSMenuItem(); viewM.submenu = NSMenu(title: "View")
        addItem(viewM.submenu!, "Toggle Dark Theme", "d", #selector(toggleDark))
        main.addItem(viewM)
        // Help
        let helpM = NSMenuItem(); helpM.submenu = NSMenu(title: "Help")
        addItem(helpM.submenu!, "About", "", #selector(showAbout))
        main.addItem(helpM)
        NSApp.mainMenu = main
    }
    func addItem(_ m: NSMenu, _ t: String, _ k: String, _ a: Selector?) {
        let i = NSMenuItem(title: t, action: a, keyEquivalent: k)
        i.target = self
        m.addItem(i)
    }
    func rebuildRecents(into m: NSMenu) {
        let r = NSMenuItem(title: "Recent Files", action: nil, keyEquivalent: "")
        let sub = NSMenu(title: "Recent Files")
        for p in recents {
            let i = NSMenuItem(title: (p as NSString).lastPathComponent, action: #selector(openRecent(_:)), keyEquivalent: "")
            i.representedObject = p; i.target = self
            sub.addItem(i)
        }
        r.submenu = sub
        m.addItem(r)
    }

    // MARK: actions
    @objc func newDoc() { guard confirmDiscard() else { return }; textView.string = ""; fileURL = nil; window.isDocumentEdited = false; refreshTitle() }
    @objc func openDlg() {
        let p = NSOpenPanel(); p.allowsMultipleSelection = false
        p.allowedFileTypes = ["txt", "md", "log", "csv", "json", "xml", "png", "jpg", "jpeg", "bmp", "gif", "ico"]
        if p.runModal() == .OK, let u = p.url { openFile(u) }
    }
    @objc func openRecent(_ s: NSMenuItem) {
        if let p = s.representedObject as? String { openFile(URL(fileURLWithPath: p)) }
    }
    func openFile(_ u: URL) {
        guard confirmDiscard() else { return }
        do {
            let s = try String(contentsOf: u, encoding: .utf8)
            textView.string = s; fileURL = u; window.isDocumentEdited = false
            pushRecent(u.path); refreshTitle()
        } catch {
            let a = NSAlert(); a.messageText = "Cannot open file."; a.runModal()
        }
    }
    @objc func saveDoc() {
        guard let u = fileURL else { saveAsDlg(); return }
        writeFile(u)
    }
    @objc func saveAsDlg() {
        let p = NSSavePanel(); p.allowedFileTypes = ["txt"]; p.nameFieldStringValue = fileURL?.lastPathComponent ?? "Untitled.txt"
        if p.runModal() == .OK, let u = p.url { fileURL = u; writeFile(u) }
    }
    func writeFile(_ u: URL) {
        do {
            try textView.string.write(to: u, atomically: true, encoding: .utf8)
            window.isDocumentEdited = false; pushRecent(u.path); refreshTitle()
        } catch {
            let a = NSAlert(); a.messageText = "Cannot save file."; a.runModal()
        }
    }
    @objc func printDoc() {
        let v = NSPrintOperation(view: textView)
        v.run()
    }
    func confirmDiscard() -> Bool {
        if !window.isDocumentEdited { return true }
        let a = NSAlert()
        a.messageText = "Do you want to save changes to \(fileURL?.lastPathComponent ?? "Untitled")?"
        a.addButton(withTitle: "Save"); a.addButton(withTitle: "Don't Save"); a.addButton(withTitle: "Cancel")
        let r = a.runModal()
        if r == .alertFirstButtonReturn { saveDoc(); return !window.isDocumentEdited }
        return r == .alertSecondButtonReturn
    }
    func pushRecent(_ p: String) {
        var r = recents.filter { $0 != p }
        r.insert(p, at: 0); recents = Array(r.prefix(10))
    }
    // find/replace
    @objc func showFind() { showFindReplace(replace: false) }
    @objc func showReplace() { showFindReplace(replace: true) }
    func showFindReplace(replace: Bool) {
        if findPanel == nil {
            findPanel = NSPanel(contentRect: NSMakeRect(0, 0, 340, replace ? 130 : 100), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            findPanel!.title = "Find and Replace"
            findField = NSTextField(frame: NSMakeRect(80, replace ? 70 : 40, 240, 22))
            findPanel!.contentView?.addSubview(findField!)
            let fl = NSTextField(labelWithString: "Find:"); fl.frame = NSMakeRect(20, replace ? 70 : 40, 50, 22)
            findPanel!.contentView?.addSubview(fl)
            if replace {
                replaceField = NSTextField(frame: NSMakeRect(80, 40, 240, 22))
                findPanel!.contentView?.addSubview(replaceField!)
                let rl = NSTextField(labelWithString: "Replace:"); rl.frame = NSMakeRect(20, 40, 60, 22)
                findPanel!.contentView?.addSubview(rl)
            }
            let nb = NSButton(frame: NSMakeRect(20, 8, 90, 24)); nb.title = "Find Next"; nb.target = self; nb.action = #selector(findNext)
            findPanel!.contentView?.addSubview(nb)
            if replace {
                let rb = NSButton(frame: NSMakeRect(120, 8, 90, 24)); rb.title = "Replace"; rb.target = self; rb.action = #selector(doReplace)
                findPanel!.contentView?.addSubview(rb)
                let ab = NSButton(frame: NSMakeRect(220, 8, 100, 24)); ab.title = "Replace All"; ab.target = self; ab.action = #selector(doReplaceAll)
                findPanel!.contentView?.addSubview(ab)
            }
        }
        findPanel!.makeKeyAndOrderFront(nil)
    }
    @objc func findNext() { find(dir: 1) }
    @objc func findPrev() { find(dir: -1) }
    func find(dir: Int) {
        guard let q = findField?.stringValue, !q.isEmpty else { return }
        let s = textView.string as NSString
        var loc = textView.selectedRange().location + (dir > 0 ? textView.selectedRange().length : -1)
        var r: NSRange
        if dir > 0 {
            r = s.range(of: q, range: NSMakeRange(min(loc, s.length), s.length - min(loc, s.length)))
            if r.location == NSNotFound { r = s.range(of: q) }
        } else {
            let end = max(loc, 0)
            r = s.range(of: q, options: .backwards, range: NSMakeRange(0, end))
            if r.location == NSNotFound { r = s.range(of: q, options: .backwards) }
        }
        if r.location == NSNotFound {
            let a = NSAlert(); a.messageText = "Cannot find \"\(q)\""; a.runModal()
        } else {
            textView.setSelectedRange(r); textView.scrollRangeToVisible(r)
        }
    }
    @objc func doReplace() {
        guard let q = findField?.stringValue, !q.isEmpty else { return }
        let rep = replaceField?.stringValue ?? ""
        let sel = textView.selectedRange()
        let s = textView.string as NSString
        if sel.length > 0 && s.substring(with: sel) == q {
            textView.insertText(rep, replacementRange: sel)
        }
        find(dir: 1)
    }
    @objc func doReplaceAll() {
        guard let q = findField?.stringValue, !q.isEmpty else { return }
        let rep = replaceField?.stringValue ?? ""
        textView.string = (textView.string as NSString).replacingOccurrences(of: q, with: rep)
    }
    @objc func showFonts() {
        let m = NSFontManager.shared
        m.target = self
        m.orderFrontFontPanel(nil)
    }
    @objc func toggleDark() {
        dark.toggle()
        applyTheme()
    }
    func applyTheme() {
        if dark {
            textView.backgroundColor = NSColor(calibratedRed: 0x2d/255.0, green: 0x2d/255.0, blue: 0x2d/255.0, alpha: 1)
            textView.textColor = .white
            textView.insertionPointColor = .white
        } else {
            textView.backgroundColor = .textBackgroundColor
            textView.textColor = .textColor
            textView.insertionPointColor = .black
        }
    }
    @objc func showAbout() {
        let a = NSAlert()
        a.messageText = "Legacy Notepad (macOS port) v1.0"
        a.informativeText = "A fast, lightweight text editor.\n\nBuilt with Swift and AppKit.\n\nPorted behavior from legacy-notepad v1.2.1 (MIT)."
        a.runModal()
    }
}

let app = NSApplication.shared
let del = AppDelegate()
app.delegate = del
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
