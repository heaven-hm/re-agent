# GTLibCpp → Cheat Agent → RE-Agent integration

## Current implementation (not a proposed merge)

- **GTLibCpp:** [heaven-hm/gtlibcpp](https://github.com/heaven-hm/gtlibcpp), a separately versioned C++ core; pinned as a Git submodule under `integrations/gtlibcpp`.
- **Cheat Agent:** vendored under `integrations/cheat-agent`. The native CMake target already includes `gtlibcpp_adapter.cpp` when `CHEAT_AGENT_ENABLE_GTLIBCPP=ON`. The upstream [cheat-agent repository](https://github.com/heaven-hm/cheat-agent) is a separate checkout and does **not** automatically receive edits made to the vendored copy.
- **RE-Agent:** tests its vendored native integration across Linux/Windows with the GitHub Actions workflow `.github/workflows/cheat-agent-native.yml`, building with GTLibCpp both enabled and disabled. A separate CI job tests pinned GTLibCpp directly.

**No code consolidation is needed merely to establish linkage: it exists already.** When improving GTLibCpp, first test its own repository, then update the pinned submodule and the adapter in Cheat Agent, then update the vendored adapter/submodule in RE-Agent, and run native integration tests. Maintain clear ownership of each upstream change and its pinned commit.

## Licensing and redistribution gate

**Important:** At the checked GTLibCpp `develop` revision, its [LICENSE](https://github.com/heaven-hm/gtlibcpp/blob/develop/LICENSE) is the custom **Heaven-HM Community Modding License**, which restricts commercial use and requires specific sharing conditions. It is not MIT and not an OSI-approved open-source license.

- Cheat Agent's MIT license does **not** automatically grant downstream users the commercial rights that GTLibCpp restricts.
- Treat a combined/bundled native distribution as carrying all applicable component license obligations. Merely including an MIT license for RE-Agent is not a substitute.
- Review `LICENSE-PRIOR`, `LICENSE_SCOPE.md`, component notices, and individual third-party contributions. Confirm which committed sources are covered by which license.
- **Do not publish or describe a GTLibCpp-enabled combined binary as unrestricted MIT-only code** unless appropriate relicensing or separate permission is actually secured.
- For commercial use or redistribution, seek authorization from the relevant copyright holders or distribute the GTLibCpp-disabled build where its own dependency and license review supports it.
- An engineering test passing does not establish license compatibility.

## Reproduce native checks

```bash
git submodule update --init integrations/gtlibcpp
cmake -S integrations/gtlibcpp -B build-gtlibcpp -DGTLIBCPP_BUILD_TESTS=ON
cmake --build build-gtlibcpp --config Release
ctest --test-dir build-gtlibcpp -C Release --output-on-failure

cmake -S integrations/cheat-agent -B build-cheat-on -DCHEAT_AGENT_ENABLE_GTLIBCPP=ON
cmake --build build-cheat-on --config Release
ctest --test-dir build-cheat-on -C Release --output-on-failure

cmake -S integrations/cheat-agent -B build-cheat-off -DCHEAT_AGENT_ENABLE_GTLIBCPP=OFF
cmake --build build-cheat-off --config Release
ctest --test-dir build-cheat-off -C Release --output-on-failure
```

These commands require compatible compilers and build dependencies. The GitHub Actions matrix is the source of actual execution results; **do not claim these pass until the workflow succeeds at the PR commit**.

## Remaining product work

The native adapter currently exposes process-memory capabilities. It is not equivalent to a full runtime semantic tracing provider, cannot independently prove original/replica application parity, and should not be advertised as such. Any new RE-Agent runtime feature must preserve explicit authorization, process identity, bounded observations, and immutable original artifacts.
