/** Adapted from heaven-hm/cheat-agent native/src/pattern_scanner.cpp (MIT).
 * Copyright (c) 2026 Haseeb Mir. See licenses/cheat-agent-MIT.txt.
 * Only the buffer-search algorithm is reused: no process access or memory writes.
 */
export const parseMemoryPattern = (
  text: string,
): readonly (number | null)[] => {
  const tokens = text.trim().split(/\s+/u);
  if (tokens.length === 0 || tokens.length > 4096 || !text.trim())
    throw new Error("Pattern must contain 1..4096 bytes");
  const pattern = tokens.map((token) => {
    if (token === "?" || token === "??") return null;
    if (!/^[0-9a-f]{2}$/iu.test(token))
      throw new Error(`Invalid pattern byte: ${token}`);
    return Number.parseInt(token, 16);
  });
  if (pattern.every((byte) => byte === null))
    throw new Error("Pattern must contain at least one concrete byte");
  return pattern;
};

export const scanMemoryPattern = (
  bytes: Uint8Array,
  pattern: readonly (number | null)[],
  maxMatches: number,
): { offsets: number[]; truncated: boolean; examinedBytes: number } => {
  if (!Number.isSafeInteger(maxMatches) || maxMatches < 1 || !pattern.length)
    throw new Error(
      "A nonempty pattern and positive safe match limit are required",
    );
  const offsets: number[] = [];
  for (let at = 0; at + pattern.length <= bytes.length; at++) {
    let found = true;
    for (let index = 0; index < pattern.length; index++) {
      const value = pattern[index];
      if (value !== null && value !== bytes[at + index]) {
        found = false;
        break;
      }
    }
    if (!found) continue;
    if (offsets.length === maxMatches)
      return { offsets, truncated: true, examinedBytes: at + pattern.length };
    offsets.push(at);
  }
  return { offsets, truncated: false, examinedBytes: bytes.length };
};
