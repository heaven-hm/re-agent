"""Validation helpers for pairing original, replica and comparison attempts."""

import hashlib
import os
from pathlib import Path
import re


RUN_ID = re.compile(r"rea-(?:original|replica|comparison)-[0-9a-f]{32}\Z")


def valid_run_id(value: object) -> bool:
    return isinstance(value, str) and RUN_ID.fullmatch(value) is not None


def run_ids_match(
    original: object,
    replica: object,
    comparison: object,
    expected_original: object,
    expected_replica: object,
) -> bool:
    """Require typed IDs and an exact pair reference from the comparison."""
    return (
        valid_run_id(original)
        and valid_run_id(replica)
        and valid_run_id(comparison)
        and original == expected_original
        and replica == expected_replica
    )


def fixture_tree_sha256(root: str | Path) -> str:
    """Hash sorted relative paths, entry types, symlink targets and file bytes."""
    root = Path(root)
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        relative = path.relative_to(root).as_posix().encode("utf-8")
        if path.is_symlink():
            kind = b"L"
            payload = os.readlink(path).encode("utf-8")
        elif path.is_file():
            kind = b"F"
            payload = path.read_bytes()
        elif path.is_dir():
            kind = b"D"
            payload = b""
        else:
            raise ValueError(f"Unsupported fixture entry: {path}")
        digest.update(len(relative).to_bytes(4, "big"))
        digest.update(relative)
        digest.update(kind)
        digest.update(len(payload).to_bytes(8, "big"))
        digest.update(payload)
    return digest.hexdigest()
