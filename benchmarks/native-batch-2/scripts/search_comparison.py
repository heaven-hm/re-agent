"""Narrow path-rendering normalization for fd's captured listing output."""


def normalize_fd_listing(data: bytes) -> tuple[str, ...]:
    """Normalize separators and a leading ./ only; preserve bytes otherwise."""
    text = data.decode("utf-8", errors="strict")
    if text == "":
        return ()
    trailing_newline = text.endswith("\n")
    lines = text.split("\n")
    if trailing_newline:
        lines.pop()
    normalized = []
    for line in lines:
        line = line.replace("\\", "/")
        if line.startswith("./"):
            line = line[2:]
        normalized.append(line)
    if trailing_newline:
        normalized.append("")
    return tuple(normalized)


def fd_search_equal_after_path_rendering(
    original: bytes, replica: str
) -> bool:
    """Compare listing items after prefix/separator normalization, no sorting."""
    replica_bytes = replica.encode("utf-8", errors="strict")
    return normalize_fd_listing(original) == normalize_fd_listing(replica_bytes)
