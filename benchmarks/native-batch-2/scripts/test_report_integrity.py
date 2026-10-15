import json
import hashlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from run_binding import fixture_tree_sha256


SCRIPT = Path(__file__).with_name("report.py")
SOURCE_ROOT = SCRIPT.parents[1]


class ReportIntegrityTests(unittest.TestCase):
    def workspace(self):
        temporary = tempfile.TemporaryDirectory(prefix="rea-batch2-report-")
        root = Path(temporary.name) / "native-batch-2"
        root.mkdir()
        for name in ("analysis", "logs", "manifests", "reports", "tests", "reconstructed"):
            shutil.copytree(SOURCE_ROOT / name, root / name, symlinks=True)
        return temporary, root

    def generate(self, root):
        subprocess.run(
            [sys.executable, str(SCRIPT), "--root", str(root)],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return json.loads((root / "reports/functional-tests.json").read_text())

    def test_raw_and_normalized_results_recompute_from_captured_streams(self):
        temporary, root = self.workspace()
        with temporary:
            report = self.generate(root)
        self.assertEqual(report["comparisonsCompleted"], 31)
        self.assertEqual(report["passed"], 29)
        self.assertEqual(report["failed"], 2)
        self.assertEqual(report["unverified"], 0)
        self.assertEqual(report["historicalComparisons"], 31)
        self.assertEqual(report["historicalMeasuredPasses"], 29)
        self.assertEqual(report["historicalMeasuredFailures"], 2)
        self.assertEqual(report["validationFailures"], [])
        version = next(
            item for item in report["cases"]
            if item["target"] == "fd" and item["case"] == "version"
        )
        self.assertEqual(version["status"], "PASS")
        self.assertEqual(version["dimensions"], {
            "stdoutBytes": "PASS",
            "stderrBytes": "PASS",
            "exitStatus": "PASS",
        })
        normalized = [
            item for item in report["cases"]
            if item["target"] == "fd" and item.get("normalizedEvidence")
        ]
        self.assertEqual(len(normalized), 11)
        self.assertEqual(sum(item["normalizedSearch"] == "PASS" for item in normalized), 11)
        self.assertEqual(sum(item["historicalNormalizedSearch"] == "PASS" for item in normalized), 11)
        fd_cases = [item for item in report["cases"] if item["target"] == "fd"]
        self.assertEqual(sum(item["status"] == "PASS" for item in fd_cases), 14)
        self.assertEqual(sum(item["status"] == "FAIL" for item in fd_cases), 1)
        self.assertEqual(sum(item["status"] == "UNVERIFIED" for item in fd_cases), 0)
        self.assertTrue(all(item["originalRunId"] and item["replicaRunId"] and item["comparisonRunId"] for item in fd_cases))
        bat = [item for item in report["cases"] if item["target"] == "bat"]
        self.assertEqual(len(bat), 8)
        self.assertTrue(all(item["status"] == "PASS" for item in bat))
        self.assertTrue(all(item["originalRunId"] and item["replicaRunId"] and item["comparisonRunId"] for item in bat))
        self.assertTrue(all(item["normalizedEvidence"]["originalCaptureSha256"] for item in normalized))
        invalid_option = next(item for item in fd_cases if item["case"] == "invalid-option")
        self.assertEqual(invalid_option["status"], "PASS")
        ripgrep = [item for item in report["cases"] if item["target"] == "ripgrep"]
        self.assertEqual(len(ripgrep), 8)
        self.assertEqual(sum(item["status"] == "PASS" for item in ripgrep), 7)
        self.assertEqual(sum(item["status"] == "FAIL" for item in ripgrep), 1)
        self.assertTrue(all(item["originalRunId"] and item["replicaRunId"] and item["comparisonRunId"] for item in ripgrep))
        self.assertEqual(sum(
            item["dimensions"].get("stdoutBytes") is False
            and item["dimensions"].get("stdoutAfterRelativePathSeparatorNormalization") is True
            for item in ripgrep
        ), 6)

    def test_tampered_original_stdout_cannot_retain_normalized_pass(self):
        temporary, root = self.workspace()
        with temporary:
            relocation = json.loads((root / "reports/fd/original-relocation.json").read_text())
            record = json.loads((root / relocation["cases"]["all"]["recordPath"]).read_text())
            path = root / record["stdout"]["path"]
            data = bytearray(path.read_bytes())
            data[0] ^= 1
            path.write_bytes(data)
            report = self.generate(root)
        item = next(case for case in report["cases"] if case["target"] == "fd" and case["case"] == "all")
        self.assertEqual(item["status"], "UNVERIFIED")
        self.assertIn("raw bytes disagree", item["reason"])

    def test_tampered_normalized_claim_cannot_be_used_as_authority(self):
        temporary, root = self.workspace()
        with temporary:
            path = root / "reports/fd/comparison.json"
            comparison = json.loads(path.read_text())
            item = next(case for case in comparison["results"] if case["id"] == "all")
            item["normalizedSearch"] = "FAIL"
            path.write_text(json.dumps(comparison), encoding="utf-8")
            report = self.generate(root)
        case = next(case for case in report["cases"] if case["target"] == "fd" and case["case"] == "all")
        self.assertEqual(case["status"], "UNVERIFIED")
        self.assertIn("does not match", case["reason"])

    def test_tampered_stream_invalidates_a_bound_target_observation(self):
        temporary, root = self.workspace()
        with temporary:
            relocation = json.loads((root / "reports/fd/original-relocation.json").read_text())
            record = json.loads((root / relocation["cases"]["version"]["recordPath"]).read_text())
            path = root / record["stdout"]["path"]
            data = bytearray(path.read_bytes())
            data[0] ^= 1
            path.write_bytes(data)
            report = self.generate(root)
        version = next(
            item for item in report["cases"]
            if item["target"] == "fd" and item["case"] == "version"
        )
        self.assertEqual(version["status"], "UNVERIFIED")
        self.assertIn("raw bytes disagree", version["reason"])
        failures = [item["path"] for item in report["validationFailures"]]
        self.assertIn("fd:version", failures)
        self.assertTrue(
            any(path.startswith("logs/runtime/attempts/rea-original-") for path in failures)
        )

    def test_attempt_history_keeps_failed_then_successful_original_runs(self):
        temporary, root = self.workspace()
        with temporary:
            targets = json.loads((root / "reports/binary-inventory.json").read_text())
            target = next(item for item in targets if item["target"] == "bat")
            fixture = root / "tests/runtime-fixtures/tree"
            fixture_hash = fixture_tree_sha256(fixture)
            for suffix, status, output in (
                ("0" * 32, "timeout", b""),
                ("1" * 32, "completed", b"bat 0.26.1\n"),
            ):
                run_id = "rea-original-" + suffix
                directory = root / "logs/runtime/attempts" / run_id
                directory.mkdir(parents=True)
                record = {
                    "schema": "rea.native-original-attempt.v1",
                    "run_id": run_id,
                    "attempt_record_path": f"logs/runtime/attempts/{run_id}/record.json",
                    "status": status,
                    "target_sha256": target["executables"][0]["sha256"],
                    "fixture_tree_sha256": fixture_hash,
                    "runner_sha256": "a" * 64,
                    "arguments": ["--version"],
                    "cwd": str(fixture),
                    "started_at": "2026-10-14T00:00:00+00:00",
                    "finished_at": "2026-10-14T00:00:01+00:00",
                }
                for stream, data in (("stdout", output), ("stderr", b"")):
                    (directory / f"{stream}.bin").write_bytes(data)
                    record[stream] = {
                        "path": f"logs/runtime/attempts/{run_id}/{stream}.bin",
                        "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest(),
                        "utf8": data.decode("utf-8"),
                    }
                (directory / "record.json").write_text(json.dumps(record), encoding="utf-8")

            self.generate(root)
            state = json.loads((root / "reports/batch-state.json").read_text())
        synthetic = [
            item for item in state["attemptHistory"]
            if item["runId"] in {"rea-original-" + "0" * 32, "rea-original-" + "1" * 32}
        ]
        self.assertEqual([item["status"] for item in synthetic], ["timeout", "completed"])
        self.assertTrue(all(item["integrity"] == "PASS" for item in synthetic))
        self.assertNotEqual(synthetic[0]["runId"], synthetic[1]["runId"])


if __name__ == "__main__":
    unittest.main()
