// imgviewmac v1: independent macOS port of imgview v0.3 (nakst/imgview, MIT).
// No original source consulted. Recovered binary-first via REA from the
// UPX-unpacked image (upx 5.2.1 -d): 116 procedures; GDI+ load
// (GdipCreateBitmapFromStream), folder navigation, zoom/pan, clipboard,
// status bar (size/coords/color/anchor), dark toggle, fit/actual-size,
// color count. macOS mapping: ImageIO decode, AppKit canvas.
import Cocoa

let exts: Set<String> = ["bmp","gif","jpeg","jpg","png","tif","tiff","wmf","emf"]

final class View: NSView {
    var img: NSImage?
    var zoom: CGFloat = 1
    var pan = NSPoint.zero
    var dark = false
    var anchor: NSPoint?
    var mouse: NSPoint?
    var color: NSColor?
    override var isFlipped: Bool { true }
    override func draw(_ r: NSRect) {
        (dark ? NSColor.black : NSColor(calibratedRed: 0.95, green: 0.95, blue: 0.95, alpha: 1)).setFill()
        r.fill()
        guard let img = img else { return }
        let sz = img.size
        let dst = NSRect(x: pan.x, y: pan.y, width: sz.width * zoom, height: sz.height * zoom)
        img.draw(in: dst)
    }
    override func mouseDragged(with e: NSEvent) {
        pan.x += e.deltaX; pan.y += e.deltaY
        if NSEvent.modifierFlags.contains(.shift) { /* keep pan+zoom: shift held */ }
        needsDisplay = true
    }
    override func mouseMoved(with e: NSEvent) {
        guard let img = img, let rep = img.representations.first else { return }
        let lx = Int((e.locationInWindow.x - frame.origin.x - pan.x) / zoom)
        let ly = Int((e.locationInWindow.y - frame.origin.y - pan.y) / zoom)
        mouse = NSPoint(x: lx, y: ly)
        if lx >= 0 && ly >= 0, let bmp = NSBitmapImageRep(data: img.tiffRepresentation ?? Data()),
           lx < bmp.pixelsWide, ly < bmp.pixelsHigh {
            color = bmp.colorAt(x: lx, y: ly)
        } else { color = nil }
        (window?.windowController as? Ctl)?.status()
        needsDisplay = true
    }
    override func acceptsFirstMouse(for e: NSEvent?) -> Bool { true }
}

final class Ctl: NSWindowController, NSDraggingDestination {
    var view: View!
    var files: [URL] = []
    var idx = 0
    var statusItem: NSTextField!
    var showBar = true

    convenience init() {
        let w = NSWindow(contentRect: NSMakeRect(100, 100, 900, 650), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        w.title = "imgview (macOS port)"
        self.init(window: w)
        view = View(frame: w.contentView!.bounds)
        view.autoresizingMask = [.width, .height]
        w.contentView?.addSubview(view)
        let bar = NSView(frame: NSMakeRect(0, 0, 900, 24))
        bar.autoresizingMask = [.width, .maxYMargin]
        statusItem = NSTextField(labelWithString: "")
        statusItem.frame = NSMakeRect(8, 4, 884, 16)
        statusItem.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        bar.addSubview(statusItem)
        w.contentView?.addSubview(bar)
        w.registerForDraggedTypes([.fileURL])
        buildMenus()
        let args = CommandLine.arguments.dropFirst()
        if let first = args.first { open(URL(fileURLWithPath: first)) }
    }
    func buildMenus() {
        let m = NSMenu()
        let f = NSMenuItem(); f.submenu = NSMenu(title: "File")
        for (t, k, a) in [("Show in folder", "o", #selector(showInFolder)),
                          ("Copy to clipboard", "c", #selector(copyImage)),
                          ("Copy as path", "C", #selector(copyPath))] as [(String, String, Selector)] {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.target = self; f.submenu!.addItem(i)
        }
        m.addItem(f)
        let v = NSMenuItem(); v.submenu = NSMenu(title: "View")
        for (t, k, a) in [("Previous", "[", #selector(prev)), ("Next", "]", #selector(next)),
                          ("Refresh", "r", #selector(refresh)), ("Fit to window", "0", #selector(fit)),
                          ("Actual size", "1", #selector(actual)), ("Toggle dark", "d", #selector(dark)),
                          ("Toggle status bar", "b", #selector(bar)), ("Count colors", "l", #selector(count))] as [(String, String, Selector)] {
            let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.target = self; v.submenu!.addItem(i)
        }
        m.addItem(v)
        NSApp.mainMenu = m
    }
    func open(_ u: URL) {
        guard let img = NSImage(contentsOf: u) else {
            let a = NSAlert(); a.messageText = "The image could not be loaded."; a.runModal(); return
        }
        view.img = img; view.zoom = 1; view.pan = .zero
        window?.title = "\(u.lastPathComponent) - imgview (macOS port)"
        let dir = u.deletingLastPathComponent()
        files = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
            .filter { exts.contains($0.pathExtension.lowercased()) }.sorted(by: { $0.path < $1.path })
        idx = files.firstIndex(of: u) ?? 0
        fit(); status()
    }
    @objc func prev() { if idx > 0 { idx -= 1; open(files[idx]) } }
    @objc func next() { if idx + 1 < files.count { idx += 1; open(files[idx]) } }
    @objc func refresh() { if idx < files.count { open(files[idx]) } }
    @objc func fit() {
        guard let s = view.img?.size, s.width > 0 else { return }
        let b = view.bounds.size
        view.zoom = min(b.width / s.width, b.height / s.height)
        view.pan = NSPoint(x: (b.width - s.width * view.zoom) / 2, y: (b.height - s.height * view.zoom) / 2)
        view.needsDisplay = true
    }
    @objc func actual() { view.zoom = 1; view.needsDisplay = true }
    @objc func dark() { view.dark.toggle(); view.needsDisplay = true }
    @objc func bar() { showBar.toggle(); statusItem.superview?.isHidden = !showBar }
    @objc func showInFolder() {
        guard idx < files.count else { return }
        NSWorkspace.shared.activateFileViewerSelecting([files[idx]])
    }
    @objc func copyImage() {
        guard let img = view.img else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.writeObjects([img])
    }
    @objc func copyPath() {
        guard idx < files.count else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(files[idx].path, forType: .string)
    }
    @objc func count() {
        guard let img = view.img, let tiff = img.tiffRepresentation,
              let bmp = NSBitmapImageRep(data: tiff) else { return }
        var set = Set<Int>()
        for y in 0..<bmp.pixelsHigh {
            for x in 0..<bmp.pixelsWide {
                if let c = bmp.colorAt(x: x, y: y) {
                    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
                    c.getRed(&r, green: &g, blue: &b, alpha: &a)
                    set.insert(Int(r * 255) << 16 | Int(g * 255) << 8 | Int(b * 255))
                }
            }
        }
        let a = NSAlert(); a.messageText = "\(set.count) unique colors in image"; a.runModal()
    }
    func status() {
        guard let s = view.img?.size else { statusItem.stringValue = ""; return }
        let m = view.mouse ?? .zero
        var c = ""
        if let col = view.color {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            col.getRed(&r, green: &g, blue: &b, alpha: &a)
            c = String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        }
        let anch = view.anchor.map { "Anchor offset: \($0.x), \($0.y)  " } ?? ""
        statusItem.stringValue = "Image size: \(Int(s.width))x\(Int(s.height))  Mouse coordinates: \(Int(m.x)), \(Int(m.y))  Color under mouse: \(c)  \(anch)"
    }
}

let app = NSApplication.shared
let ctl = Ctl()
ctl.showWindow(nil)
app.setActivationPolicy(.regular)
app.activate(ignoringOtherApps: true)
app.run()
