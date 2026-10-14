# imgview v0.3 — macOS image-viewer subset

**Application status: PARTIAL.** A Swift/AppKit replica is present at
[`main.swift`](../../imgview/replica/main.swift), with a checked-in arm64
executable. The retained manifest records a live PNG display and status bar as
PASS. JPEG loading and the implemented zoom, pan, clipboard, dark-mode and
color-count interactions remain UNVERIFIED. No comparison against the packed
Windows original is recorded, so this is not a fidelity claim.

The original PE identity, unpacked-image digest, reconstructed feature notes,
build command and tested subset are recorded in
[`manifest.json`](../../imgview/manifest.json). The real macOS capture is
[`imgviewmac-app.png`](../../screenshots/imgviewmac-app.png); it shows the
replica displaying `sample.png` and its image status bar. The application in
this screenshot is the replica, not the Windows original.

The original release executable is UPX-packed. The earlier report that treated
UPX availability as a blocker is stale: the current manifest records 116
analysis procedures and image-viewer behaviors from the unpacked image. The
source, artifact and capture are included in the benchmark catalog and package.
Only the single recorded PNG render is presently verified.

## GUI comparison attempt

I rebuilt and launched the macOS candidate with a deterministic 64×64 PNG input.
The AppKit process remained alive until interrupted, but the host capture tool
returned `could not create image from display 0`. No image was created, and the
Windows original was not launched for this attempt. See
[`imgview-capture-attempt.json`](../../screenshots/imgview-capture-attempt.json).
Therefore the original-vs-replica GUI comparison remains **UNVERIFIED**; the
retained `imgviewmac-app.png` is still replica-only.
