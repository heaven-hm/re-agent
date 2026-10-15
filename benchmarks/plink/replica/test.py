#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


script_dir = Path(__file__).resolve().parent
binary = Path(sys.argv[1]).resolve()
golden_cases = {
    "no-args": ([], "plinkmac-golden-noargs.txt"),
    "help": (["--help"], "plinkmac-golden-help.txt"),
    "pgpfp": (["-pgpfp"], "plinkmac-golden-pgpfp.txt"),
}

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

comparisons = []
for case_id, (arguments, golden_name) in golden_cases.items():
    result = subprocess.run([str(binary), *arguments], capture_output=True, check=False)
    golden = (script_dir / "goldens" / golden_name).read_bytes()
    passed = result.returncode == 0 and result.stdout == golden and result.stderr == b""
    comparisons.append(
        {
            "case": case_id,
            "arguments": arguments,
            "exitCode": result.returncode,
            "stderrBytes": len(result.stderr),
            "observedStdoutSha256": sha256(result.stdout),
            "goldenSha256": sha256(golden),
            "stdoutBytesEqual": result.stdout == golden,
            "passed": passed,
        }
    )

# Windows-specific version fields differ by host, so check its portable
# release/commit fields and the candidate's actual macOS platform fields.
version_result = subprocess.run([str(binary), "-V"], capture_output=True, check=False)
version_golden = (script_dir / "goldens" / "plinkmac-golden-version.txt").read_bytes()
version_lines = version_result.stdout.split(b"\r\n")
version_fields_match = (
    len(version_lines) == 5
    and version_lines[0] == b"plink: Release 0.85"
    and version_lines[1].startswith(b"Build platform: 64-bit ARM macOS")
    and version_lines[2].startswith(b"Compiler: clang ")
    and version_lines[2].endswith(b", macOS SDK")
    and version_lines[3]
    == b"Source commit: a3cce3a48d4ab12e0fccb32998b9042d4f7c3ff1"
    and version_lines[4] == b""
    and version_result.stdout.count(b"\r\n") == 4
)
comparisons.append(
    {
        "case": "version",
        "arguments": ["-V"],
        "exitCode": version_result.returncode,
        "stderrBytes": len(version_result.stderr),
        "observedStdoutSha256": sha256(version_result.stdout),
        "goldenSha256": sha256(version_golden),
        "stdoutBytesEqual": version_result.stdout == version_golden,
        "comparison": "host-aware semantic assertions; Windows/macOS fields differ",
        "passed": version_result.returncode == 0
        and version_result.stderr == b""
        and version_fields_match,
    }
)

report = {
    "schemaVersion": 1,
    "createdAt": datetime.now(timezone.utc).isoformat(),
    "target": "plink CLI-surface replica",
    "scope": "candidate output compared byte-for-byte for no-args/help/pgpfp; -V checks host-aware behavior while preserving portable fields. Original-side provenance is not established by this receipt",
    "candidate": {
        "path": "benchmarks/plink/replica/build/plinkmac",
        "sha256": sha256(binary.read_bytes()),
        "bytes": binary.stat().st_size,
    },
    "comparisons": comparisons,
    "passed": sum(case["passed"] for case in comparisons),
    "failed": sum(not case["passed"] for case in comparisons),
    "originalBinaryHashFromManifest": "969f36879d5716aa1a9811f43a6a6510e8f08372dbeb9695b810b9c776f39c75",
    "limits": [
        "The previously cited original runtime receipt is not present in this repository.",
        "Matching a retained golden does not independently prove that the golden came from the stated original binary.",
        "Version behavior is checked semantically because Windows and macOS platform/compiler fields differ; its stdout is not byte-identical to the original.",
        "Unknown-option behavior is not included in this receipt.",
        "SSH/network transport is out of scope.",
    ],
}
report_path = script_dir.parent / "reports" / "replica-golden-comparison.json"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": str(report_path), "passed": report["passed"], "failed": report["failed"]}))
if report["failed"]:
    raise SystemExit(1)
