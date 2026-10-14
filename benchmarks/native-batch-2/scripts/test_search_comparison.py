import unittest

from search_comparison import (
    fd_search_equal_after_path_rendering,
    normalize_fd_listing,
)


class FdSearchComparisonTests(unittest.TestCase):
    def test_normalizes_only_path_prefix_and_separator(self):
        self.assertTrue(
            fd_search_equal_after_path_rendering(
                b"./sub\\file.txt\n./empty\\\n",
                "sub/file.txt\nempty/\n",
            )
        )

    def test_preserves_order(self):
        self.assertFalse(
            fd_search_equal_after_path_rendering(
                b"./a.txt\n./b.txt\n", "b.txt\na.txt\n"
            )
        )

    def test_preserves_line_ending_bytes(self):
        self.assertFalse(
            fd_search_equal_after_path_rendering(b"./a.txt\r\n", "a.txt\n")
        )

    def test_normalizes_backslash_path_separators(self):
        self.assertEqual(normalize_fd_listing(b"./a\\b\n"), ("a/b", ""))

    def test_rejects_non_utf8_output(self):
        with self.assertRaises(UnicodeDecodeError):
            normalize_fd_listing(b"\xff\n")


if __name__ == "__main__":
    unittest.main()
