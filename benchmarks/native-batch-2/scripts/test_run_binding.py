import tempfile
import unittest
from pathlib import Path

from run_binding import fixture_tree_sha256, run_ids_match, valid_run_id


class RunBindingTests(unittest.TestCase):
    def test_accepts_well_formed_run_id(self):
        self.assertTrue(valid_run_id("rea-original-0123456789abcdef0123456789abcdef"))

    def test_rejects_missing_or_wrong_kind_run_id(self):
        self.assertFalse(valid_run_id(None))
        self.assertFalse(valid_run_id("rea-unrecognized-0123456789abcdef0123456789abcdef"))
        self.assertFalse(valid_run_id("rea-original-short"))

    def test_requires_comparison_to_reference_the_original_and_replica_runs(self):
        original = "rea-original-0123456789abcdef0123456789abcdef"
        replica = "rea-replica-0123456789abcdef0123456789abcdef"
        comparison = "rea-comparison-0123456789abcdef0123456789abcdef"
        self.assertTrue(run_ids_match(original, replica, comparison, original, replica))
        self.assertFalse(run_ids_match(None, replica, comparison, original, replica))
        self.assertFalse(run_ids_match(original, replica, comparison, "different", replica))

    def test_fixture_digest_changes_when_content_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = root / "input.txt"
            fixture.write_bytes(b"first")
            first = fixture_tree_sha256(root)
            fixture.write_bytes(b"second")
            self.assertNotEqual(first, fixture_tree_sha256(root))

    def test_fixture_digest_is_independent_of_creation_order(self):
        with tempfile.TemporaryDirectory() as left, tempfile.TemporaryDirectory() as right:
            one, two = Path(left), Path(right)
            (one / "b").write_bytes(b"B")
            (one / "a").write_bytes(b"A")
            (two / "a").write_bytes(b"A")
            (two / "b").write_bytes(b"B")
            self.assertEqual(fixture_tree_sha256(one), fixture_tree_sha256(two))


if __name__ == "__main__":
    unittest.main()
