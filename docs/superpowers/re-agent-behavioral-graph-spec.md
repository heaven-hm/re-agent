# RE-Agent Behavioral Evidence Graph — First-Slice Design

**Status:** Draft for review  
**Repository baseline:** `develop` at `213bf08ad82f5ca270604efbe650638076e88d47` (verified through GitHub API)  
**Related work:** Issue #25; draft PR #29 (not merged)

## 1. Goal

Integrate static and runtime observations already represented by RE-Agent's Evidence and provider interfaces into a durable, provenance-linked behavioral graph. A maintainer must be able to ask which evidence supports a function/effect/state assertion, see contradictions and gaps, and export a deterministic graph bound to the exact binary identity.

This slice establishes a working evidence integration path. It does not claim whole-program behavioral recovery or equivalence.

## 2. Existing architecture to preserve

The reviewed `develop` source already provides:

- Strict provider-neutral Evidence records with provider and analysis-profile identity, subject digest, raw/normalized result, confidence, limitations, locations, and evidence links.
- An `AnalysisProvider` boundary for provider-backed observations.
- Existing Ghidra, Hopper, IDA, radare2, Frida/LLDB, process-capture, CLI/MCP and checkpoint/report paths.
- A bounded `AutonomousInvestigation` controller that persists Evidence and scenario results.
- An `EvidenceLedger` that owns immutable Evidence records, plus specialized native and JavaScript application graph workflows. The new graph is a cross-domain projection: retain those specialized results and reference their Evidence IDs instead of copying their full payloads into another source-of-truth store.
- Draft PR #29's small graph schema/merge foundation. It is unmerged, lacks provider integration, and its PR description says tests were not run.

Implementation should inspect current code and PR diffs after obtaining a local checkout. Reuse or supersede draft code only after verifying its actual diff and behavior. Do not add another analysis provider, MCP server, or independent Evidence store.

## 3. First-slice behavior

### 3.1 Graph records

Add a versioned, strict graph representation with:

- **Graph identity:** schema version, exact target binary SHA-256, optional module/build identity, creation/import profile, and source checkpoint/evidence-set identity.
- **Nodes:** functions, basic blocks, data/state objects, external effects, behavioral hypotheses, candidate implementations, regression cases, and verification results.
- **Edges:** contains, calls, data/dependency flow, reads/writes, transitions, causes/effects, supports/contradicts, implements, and verified-by.
- **Assertion provenance:** one or more immutable Evidence IDs for each asserted relationship or property, plus assertion classification and explicit limitations.

Use stable identities tied to binary identity and module-relative locations where available. Resolve runtime addresses to static locations only when module identity and relocation data support that mapping. Preserve unresolved or ambiguous mappings as such.

### 3.2 Evidence import and queries

- Import existing static and runtime Evidence through their current provider outputs and persistence paths.
- Keep observed facts separate from derived and inferred assertions. Conflicting observations coexist and retain their provenance.
- Reject evidence whose target identity cannot be bound to the graph binary. Do not silently accept a filename match as identity.
- Support deterministic, idempotent import and export. Reimporting the same evidence must not duplicate graph facts or rewrite their provenance.
- Provide bounded queries for evidence supporting or contradicting an assertion, uncovered relationships, unresolved mappings, and functions associated with observed effects.
- Surface the graph through the existing investigation checkpoint/report and current CLI/MCP contracts. Do not create a new server.

### 3.3 Uncertainty and incomplete coverage

Graph imports must retain provider-reported coverage, limitations, dropped/partial observation markers, and ambiguous correspondence. Missing evidence is a gap, never proof of absence. A graph may contain both supporting and contradicting observations. No graph status may imply universal application equivalence.

## 4. Validation and failure behavior

Use strict schemas and explicit outcomes for malformed input, unsupported graph versions, mismatched binary identity, missing evidence references, ambiguous mappings, conflicting assertions, incomplete provider coverage, and graph-size/budget exhaustion. Persisted data must be validated when loading or resuming; corruption must not be normalized into a passing result.

## 5. Acceptance criteria

1. A compiled native fixture is analyzed through an existing static provider and executed through an existing runtime/process path; both records join the same graph using the same binary identity.
2. Every graph assertion resolves to immutable Evidence IDs and retains exact provider/version, profile, target hash, and limitations.
3. ASLR relocation can be normalized only with explicit module identity and relocation evidence; uncertain matches remain ambiguous.
4. Reordered and repeated imports produce a deterministic graph with no duplicate assertions.
5. Conflicting observations remain visible and do not collapse into a single inferred truth.
6. Wrong-binary evidence, dangling Evidence IDs, invalid schema versions, tampered records, truncated traces, and graph-budget overflow are rejected or reported as incomplete with negative tests.
7. Checkpoint save/reopen preserves the graph and its provenance; unsupported migrations fail explicitly.
8. Existing provider, CLI/MCP, controller, and Evidence tests remain passing. No regression is established until those tests are executed.
9. A reproducible export includes schema version, graph digest, binary identity, source Evidence IDs, provider/profile identities, uncertainty, and coverage.

## 6. Initial implementation scope

Expected areas to inspect and likely extend:

- `src/domain/evidence.ts` and `src/domain/reconstruction/BehavioralEvidenceGraph.ts`
- Existing provider result normalization and Evidence persistence/import boundaries
- `src/application/autonomy/` checkpoint, report, and investigation flows
- Existing CLI/MCP registration and contracts
- Focused domain, boundary, controller/checkpoint, and provider integration tests
- Architecture and evidence-workflow documentation

The exact file list is provisional until local source inspection and a comparison of draft PR #29 against `develop`.

## 7. Explicitly out of scope for this slice

- New binary analyzers or a second MCP server.
- Live memory instrumentation and semantic heap reconstruction (Issue #26).
- Differential fuzzing/minimization integration and persistent corpus management (Issue #27).
- SMT witness replay or general machine-code equivalence (Issue #28).
- Automatic source reconstruction or repair of arbitrary programs.
- Selecting, redistributing, or claiming completion of a document-reader, media-player, or game maintenance case study.
- Claims that finite tests prove universal behavior.

## 8. Environment and verification prerequisite

The checkout is available at `213bf08ad82f5ca270604efbe650638076e88d47` on the feature branch. `npm ci` and the baseline `npm run check:fast` passed. The prepared baseline `npm run test:fast` ran 479 files: 472 passed, 7 failed (10 tests), 5 skipped. Codex Cloud has gcc but lacks clang, radare2/r2, Ghidra and GUI/audio/Windows/macOS runtime. Therefore provider-backed native static analysis and a compiled-native static/runtime join remain **BLOCKED — NOT EXECUTED**.

## 9. License and evidence handling

Keep the repository's MIT license and existing copyright notices. Do not add target binaries/assets to the graph or public reports by default. Preserve only the identities and evidence required for reproducibility, and honor third-party license, authorization, and redistribution boundaries. A graph records evidence; it does not establish legal authority.
