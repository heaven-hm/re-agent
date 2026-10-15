# License Compatibility & Legal Boundaries

## 1. Project Licensing

`Cheat Agent` is distributed under the **MIT License**.

```text
SPDX-License-Identifier: MIT
```

---

## 2. Third-Party Licenses & Ingestion Rules

Cheat Agent carefully manages third-party intellectual property and avoids GPL contamination.

| Project / Component | License | Compatibility with Cheat Agent (MIT) | Notes / Boundary Constraints |
| :--- | :--- | :--- | :--- |
| **GTLibCpp** | Community Modding License | **Compatible** | Permitted for non-commercial and modding use. Linked natively on Windows. |
| **Zydis** | MIT | **100% Compatible** | Included or linked as submodule/CMake target. |
| **Capstone** | BSD-3-Clause | **100% Compatible** | Permissive, compatible with MIT. |
| **Ghidra** | Apache-2.0 | **Compatible** | Apache-2.0 is compatible with downstream proprietary and MIT integration. |
| **Official Cheat Engine** | GPL-2.0 / GPL-3.0 | **Isolated Protocol / Format Only** | **NEVER link or copy Cheat Engine source code.** Cheat Agent only reads/writes the open XML `.CT` format and interoperates via standard protocols. |
| **scanmem** | GPL-3.0 | **Isolated Reference Only** | Do NOT link `libscanmem`. Implement independent Linux memory scanning via native POSIX `process_vm_readv`. |
| **x64dbg** | GPL-3.0 | **Incompatible for Linking** | Do not embed or link x64dbg. |
| **Rust Crates (Tokio, Serde, Rusqlite)** | MIT / Apache-2.0 | **100% Compatible** | Permissive dual-licensed crates. |

---

## 3. Clear Room Protocol Boundaries

1. **Cheat Engine Tables (.CT):**
   Cheat Engine tables are UTF-8 XML files containing variable offsets and hotkey descriptions. Generating or reading XML does not cause copyright infringement or trigger copyleft provisions under GPL.
2. **Linux & macOS Scanning Implementations:**
   Rather than porting GPL code from `scanmem`, Cheat Agent uses standard OS syscalls:
   - Linux: `process_vm_readv(2)`, `process_vm_writev(2)`, `/proc/[pid]/maps`.
   - macOS: `mach_vm_read_overwrite`, `mach_vm_write`, `mach_vm_region_recurse`.
3. **Target Games & Modding Ethics:**
   Cheat Agent is strictly designed for:
   - Authorized offline single-player games.
   - Developer regression and game-balancing testing.
   - Controlled test processes and test games.
   - Educational reverse-engineering research.

Any online multiplayer tampering, anti-cheat circumvention, or unauthorized distribution is strictly out of scope and explicitly prohibited by project security policies.
