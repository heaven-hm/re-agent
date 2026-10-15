# Community maintenance skills

Contribute one directory under `maintenance-skills/` containing `SKILL.md` and `skill.json`. Discovery happens when `maintenance-skills` or `maintenance-plan` runs; no hardcoded registration is needed. For private/local skills, pass `--directory /absolute/community/root` without changing the package.

```json
{
  "schema_version": 1,
  "id": "legacy-file-format-repair",
  "version": "1.0.0",
  "description": "Recover and test a discontinued application's document format.",
  "license": "MIT",
  "targets": ["software"],
  "platforms": ["windows", "linux", "macos"],
  "stages": ["static-analysis", "verification"],
  "tools": ["open_binary", "analyze_function", "compare_artifacts"]
}
```

`SKILL.md` starts with YAML frontmatter whose unquoted `name` matches `id` and a useful `description`. Keep the body focused on actual evidence, scope, steps, failure conditions and verification. Add references only when needed. Tool names are requirements to discover, not proof that tools are installed. Do not introduce a second MCP server for an already-supported capability.

The catalog validates its closed manifest schema and records hashes of both files. Unknown fields (including executable commands), invalid frontmatter, symbolic roots/files and ambiguous duplicate IDs are rejected. Missing roots and rejected modules make the catalog INCOMPLETE. Discovery is bounded to 1024 entries per root and 256 KiB per metadata/instruction file. A matching manifest is not a safety audit of the instructions; the host must review untrusted community content and retain user authority boundaries. No directory is auto-executed or fetched from the network.

Declare the skill license using its SPDX identifier/expression. The catalog records this declaration; it does not establish license compatibility or redistribution rights. Preserve actual copyright and license files when distributing a skill; declaring a license is not a license audit of external tools/assets. Keep third-party obligations separate from the RE-Agent MIT license.

Before contributing, demonstrate the skill on an authorized fixture or unsupported target, retain real evidence and failures, and disclose which OS/provider combinations were exercised. Never add a heuristic that turns unknown behavior into PASS. See [usage policy](../USAGE_POLICY.md) and [legacy workflow](legacy-maintenance.md).
