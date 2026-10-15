import AppKit

@MainActor
final class CalculatorApplicationDelegate: NSObject, NSApplicationDelegate {
    private var calculatorWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let engine = CalculatorEngine()
        let window = createCalculatorWindow(engine: engine)
        calculatorWindow = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

@main
@MainActor
struct CalculatorApp {
    static func main() {
        let application = NSApplication.shared
        let applicationDelegate = CalculatorApplicationDelegate()
        application.delegate = applicationDelegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}
