# Security & Threat Model

## 1. Safety Principles & Policy Enforcement

1. **Default Read-Only:** All tools and scanning operations default to non-invasive memory reads. Memory mutation requires explicit authorization.
2. **Target Scope Restriction:** Cheats and memory operations can only attach to explicitly authorized process identities (PID + image SHA-256 hash matching).
3. **Emergency Stop (Kill Switch):** Immediate atomic suspension of any ongoing memory freeze or mutation workers.
4. **Original Memory Snapshot & Rollback:** Before any mutation is applied, the original memory bytes are snapshotted so they can be restored upon trainer termination.
5. **Untrusted Model Guardrails:** Arguments received from AI models (via MCP or LLM APIs) are treated as untrusted user input. Addresses, sizes, and buffer limits are strictly bounded and validated before passing to native system calls.

---

## 2. Explicit Prohibitions

Cheat Agent is exclusively engineered for authorized offline single-player games, reverse-engineering education, and developer QA testing.

The following capabilities are explicitly banned and will not be implemented:
- Online multiplayer cheating or network packet interception.
- Kernel-level anti-cheat driver tampering or bypasses (BattlEye, Easy Anti-Cheat, Vanguard, Ricochet).
- DRM circumvention or copyright protection removal (Denuvo, VMProtect).
- Malware injection techniques, rootkits, or hidden process persistence.
- Privilege escalation or system security restriction circumvention.
