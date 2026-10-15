#!/usr/bin/env python3
"""Compare a narrow rea-rg subset against integrity-checked original receipts."""
import hashlib
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
BASE = HERE.parents[1]
ORIGINAL_SHA256 = "14231169855ec5205cf5a1b6f1db358ff4aed4247c86b69ce8aae647c77f6680"
ORIGINAL_BINARY = BASE / "originals/ripgrep/extracted/ripgrep-15.2.0-x86_64-pc-windows-msvc/rg.exe"
TREE = BASE / "tests/runtime-fixtures/tree"
CASES = {
    "search": ["--color", "never", "--sort", "path", "--no-heading", "needle", "."],
    "number": ["--color", "never", "--sort", "path", "--no-heading", "-n", "needle", "."],
    "ignorecase": ["--color", "never", "--sort", "path", "--no-heading", "-i", "needle", "."],
    "fixed": ["--color", "never", "--sort", "path", "--no-heading", "-F", "needle", "."],
    "hidden": ["--color", "never", "--sort", "path", "--no-heading", "--hidden", "needle", "."],
    "no-ignore": ["--color", "never", "--sort", "path", "--no-heading", "--no-ignore", "needle", "."],
    "invalid-regex": ["--color", "never", "--sort", "path", "--no-heading", "[", "."],
    "version": ["--version"],
}
EXPECTED_DIFFERENCES = {}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def main():
    exe = HERE / "build" / "rea-rg"
    subprocess.run([str(HERE / "build.sh")], check=True, cwd=HERE, capture_output=True)
    failures = []
    exact = 0
    expected_mismatches = 0
    if digest(ORIGINAL_BINARY.read_bytes()) != ORIGINAL_SHA256:
        print("[FAIL] original executable does not match the acquisition hash")
        return 1
    for case, args in CASES.items():
        receipt_path = BASE / "logs/runtime" / f"ripgrep-{case}.json"
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("target_sha256") != ORIGINAL_SHA256 or receipt.get("status") != "completed":
            failures.append(f"{case}: original receipt identity/status is invalid")
            continue
        stream_data = {}
        for stream in ("stdout", "stderr"):
            stream_data[stream] = (BASE / receipt[stream]["path"]).read_bytes()
            record = receipt[stream]
            if (digest(stream_data[stream]) != record["sha256"] or
                    len(stream_data[stream]) != record["bytes"]):
                failures.append(f"{case}: original {stream} byte count or digest mismatch")
        if failures:
            continue
        original = stream_data["stdout"]
        result = subprocess.run([str(exe), *args], cwd=TREE, capture_output=True,
                                env={"PATH": "/usr/bin:/bin", "LC_ALL": "C"})
        expected_exit = receipt["exit_code"]
        if result.returncode != expected_exit:
            failures.append(f"{case}: exit {result.returncode}, original {expected_exit}")
        # The only normalization is Windows path separators versus macOS separators.
        candidate = result.stdout.replace(b"\\", b"/")
        expected = original.replace(b"\\", b"/")
        stdout_differs = candidate != expected
        stderr_differs = result.stderr != stream_data["stderr"]
        observed = {name for name, differs in (("stdout", stdout_differs), ("stderr", stderr_differs)) if differs}
        expected = EXPECTED_DIFFERENCES.get(case, set())
        if observed == expected:
            if observed:
                expected_mismatches += 1
                print(f"[KNOWN-MISMATCH] {case}: stderr differs; exit status agrees ({result.returncode})")
            else:
                exact += 1
                print(f"[PASS] {case}: streams and exit status match after path-separator normalization")
        else:
            failures.append(f"{case}: observed differences {sorted(observed)}, expected {sorted(expected)}; "
                            f"candidate stdout sha256 {digest(result.stdout)}, original {digest(original)}")
    if failures:
        print("[FAIL] " + "\n[FAIL] ".join(failures))
        return 1
    print(f"[SUMMARY] {exact}/{len(CASES)} exact receipt matches; "
          f"{expected_mismatches} known mismatch; path-separator normalization only; "
          "CrossOver observations, not Windows OS evidence")
    return 0

if __name__ == "__main__":
    sys.exit(main())
