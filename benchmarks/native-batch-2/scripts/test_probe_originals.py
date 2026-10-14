import subprocess
import unittest
import importlib.util
from pathlib import Path
from unittest.mock import patch

module_spec = importlib.util.spec_from_file_location(
    "probe_originals", Path(__file__).with_name("probe-originals.py")
)
probe_originals = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(probe_originals)


class OriginalCaptureTests(unittest.TestCase):
    def capture(self, result, stream_limit=1048576):
        with patch.object(probe_originals.subprocess, "run", result):
            return probe_originals.capture_command(
                ["tool"], ".", {}, stream_limit=stream_limit
            )

    def test_captures_a_completed_target(self):
        completed = subprocess.CompletedProcess(["tool"], 3, b"out", b"err")
        self.assertEqual(
            self.capture(lambda *args, **kwargs: completed),
            ("completed", 3, b"out", b"err", None),
        )

    def test_rejects_a_cross_over_wineserver_crash_even_with_zero_exit(self):
        completed = subprocess.CompletedProcess(
            ["tool"], 0, b"", b"wineserver crashed\n"
        )
        status, exit_code, stdout, stderr, limitation = self.capture(
            lambda *args, **kwargs: completed
        )
        self.assertEqual((status, exit_code, stdout, stderr), (
            "runtime_failed", 0, b"", b"wineserver crashed\n"
        ))
        self.assertIn("target behavior is not accepted", limitation)

    def test_caps_retained_streams_and_rejects_the_attempt(self):
        completed = subprocess.CompletedProcess(["tool"], 0, b"x" * 5, b"")
        result = self.capture(lambda *args, **kwargs: completed, stream_limit=1)
        self.assertEqual(result[:4], ("output_limit_exceeded", 0, b"x", b""))

    def test_records_timeouts_and_spawn_errors(self):
        timeout = subprocess.TimeoutExpired(["tool"], 1, output=b"partial")
        timed_out = self.capture(
            lambda *args, **kwargs: (_ for _ in ()).throw(timeout)
        )
        self.assertEqual(timed_out[:4], ("timeout", None, b"partial", b""))

        spawn_error = self.capture(
            lambda *args, **kwargs: (_ for _ in ()).throw(OSError("missing tool"))
        )
        self.assertEqual(spawn_error[:4], (
            "spawn_error", None, b"", b"missing tool"
        ))


if __name__ == "__main__":
    unittest.main()
