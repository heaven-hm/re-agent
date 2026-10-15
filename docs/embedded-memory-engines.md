# Embedded Cheat Agent + GTLibCpp

RE-Agent embeds **Cheat Agent** as a maintained source snapshot in
[`integrations/cheat-agent`](../integrations/cheat-agent), and **GTLibCpp**
as a revision-pinned Git submodule in
[`integrations/gtlibcpp`](../integrations/gtlibcpp).

Cheat Agent handles candidate scans, AoB, pointer investigation, trainer
generation, and native FFI. GTLibCpp provides the underlying typed memory
session and Windows process backend where available. RE-Agent's own MCP /
agent orchestration remains the outer control plane.

## Clone and build

```bash
git clone --recurse-submodules https://github.com/heaven-hm/re-agent.git
cd re-agent
# For an existing checkout:
git submodule update --init --recursive integrations/gtlibcpp
cmake -S integrations/cheat-agent -B build-cheat-agent -DCHEAT_AGENT_ENABLE_GTLIBCPP=ON
cmake --build build-cheat-agent --config Release
ctest --test-dir build-cheat-agent -C Release --output-on-failure
```

On Windows, optionally build the example (offline, read-only by default):

```powershell
cmake -S integrations/cheat-agent -B build-cheat-agent -DCHEAT_AGENT_ENABLE_GTLIBCPP=ON -DCHEAT_AGENT_BUILD_IGI_EXAMPLE=ON
cmake --build build-cheat-agent --config Release --target igi_trainer
```

CMake detects a sibling checkout under `integrations/gtlibcpp` and uses
`add_subdirectory` rather than downloading a second copy. A checkout
without the submodule initialized may fall back to Cheat Agent's pinned
FetchContent revision; initialize the submodule for reproducible RE-Agent
builds.

## Version and licensing boundaries

- GTLibCpp is pinned by the gitlink in `integrations/gtlibcpp`; advancing
  that revision requires tests and a deliberate PR.
- Cheat Agent is currently an ordinary vendored source **copy**, not a
  submodule, and must be synchronized explicitly with its upstream repository.
- The outer RE-Agent project and Cheat Agent use MIT licensing, but GTLibCpp
  is governed by the **Heaven-HM Community Modding License** (custom,
  noncommercial restrictions). The MIT license does *not* automatically
  relicense or supersede GTLibCpp; see the submodule's LICENSE before
  redistributing or shipping binaries. Preserve its independent attribution
  and terms.
- Embedding source does not automatically expose Cheat Agent's tools through
  the RE-Agent MCP dispatcher. [Tracking issue #21](https://github.com/heaven-hm/re-agent/issues/21)
  still requires tested, versioned tool routing and authorization.

## Validation

The `Vendored Cheat Agent native integration` workflow checks native CMake
build/tests with the integration enabled and disabled on Ubuntu and Windows,
and attempts Windows compilation of the IGI trainer. It does not establish
actual game behavior, autonomous trainer verification or end-to-end
MCP→native integration.
