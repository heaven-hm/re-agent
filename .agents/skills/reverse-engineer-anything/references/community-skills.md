# Community skill discovery

Each module has skill.json (schema_version, id, version, description, license, targets, platforms, stages, tools) and SKILL.md with matching YAML-frontmatter name. Put contributed modules in maintenance-skills/ or choose a private root with `maintenance-skills --directory /path/to/root`. No manual registry edit is required.

Discovery reads bounded regular files, hashes manifests/instructions and rejects unknown manifest fields, symbolic entries, invalid frontmatter and duplicate IDs. It does not import code, run scripts, install tools or establish that instructions are safe. Review community instructions as untrusted data within the user's scope. An ID collision cannot replace a bundled skill. License strings are declarations, not a compliance audit.

Stage names are triage, static-analysis, runtime-analysis, memory-analysis, repair-and-port, verification and release. Target kinds are software/game; platforms are windows/linux/macos. Tool declarations name existing advertised operations; do not add a competing server for an existing capability. Demonstrate changes on authorized fixtures and retain real success/failure evidence. See docs/community-skills.md in the package for the complete example and contribution requirements.
