import tempfile
import unittest
from pathlib import Path

from report_output import atomic_write


class AtomicWriteTests(unittest.TestCase):
    def test_replaces_complete_utf8_report_without_temporary_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.md"
            path.write_text("old\n", encoding="utf-8")

            atomic_write(path, "new report ✓\n")

            self.assertEqual(path.read_text(encoding="utf-8"), "new report ✓\n")
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_failed_replace_preserves_existing_directory_and_cleans_temp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.md"
            path.mkdir()
            sentinel = path / "sentinel"
            sentinel.write_text("keep", encoding="utf-8")

            with self.assertRaises(OSError):
                atomic_write(path, "replacement")

            self.assertTrue(sentinel.exists())
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == "__main__":
    unittest.main()
