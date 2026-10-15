# Self-Verification Engine Specification

## The Core Differentiator: Closed-Loop Verification

Most game manipulation tools stop after an address is written to. In real games, a successful memory write is NOT proof of a working cheat:
- The address might be a display-only HUD variable.
- The address might be an ephemeral heap allocation destroyed when changing rooms or reloading.
- The address might be overwritten immediately by game engine tick logic.
- The game might crash upon restarting because of hardcoded ASLR assumptions.

**Cheat Agent enforces a strict 5-stage Verification Gatekeeper:**

```text
+------------------------+
| 1. MEMORY_WRITE        | Check: Value at target address changed without OS error.
+------------------------+
            | Pass
            v
+------------------------+
| 2. GAME_BEHAVIOR       | Check: Target game behavior alters as expected
+------------------------+        (e.g., ammo does not decrease upon firing).
            | Pass
            v
+------------------------+
| 3. RESTART_PERSISTENCE | Check: Target process terminated, restarted;
+------------------------+        pointer chain / AoB resolves to new heap address.
            | Pass
            v
+------------------------+
| 4. TRAINER_BUILD       | Check: Generated C++20 and Rust trainer source files
+------------------------+        compile into standalone native executables with 0 errors.
            | Pass
            v
+------------------------+
| 5. TRAINER_EXECUTION   | Check: Standalone trainer launched against restarted game;
+------------------------+        successfully locks/modifies target state.
```

Only when all 5 stages pass is a cheat declared **VERIFIED**.

---

## Test Game Verification Harness

Cheat Agent includes a dedicated, native, cross-platform test game (`examples/test-game`):
- Dynamically allocates a `Player` structure on the heap.
- Simulates realistic multi-level pointer chains (`GameManager -> World -> Player -> Inventory -> Ammo`).
- On restart, heap allocations randomize locations (simulating ASLR and heap churning).
- Exposes deterministic inspection flags via IPC or shared state for ground-truth validation.
