# Behavioral Evidence Graph Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, provenance-linked behavioral graph projection over RE-Agent's existing Evidence and provider outputs, and persist it through the existing autonomous-investigation workflow.

**Architecture:** Keep Evidence as the source of truth in the existing investigation record/checkpoint. Add a bounded provider-neutral graph projection and import/query functions, reusing the native and JavaScript graph workflows as source models rather than replacing them. Integrate the projection with the existing autonomous-investigation state and status/report paths; do not add an MCP server.

**Tech Stack:** TypeScript, Zod, Node.js 22.19+ or 24.11+, Vitest; existing RE-Agent Evidence, graph, provider, controller, CLI and MCP code.

**Spec:** `../re-agent-behavioral-graph-spec.md`

## Global Constraints

- Bind every graph to the exact target SHA-256.
- Preserve immutable Evidence IDs and provider/profile identity; do not copy Evidence into a second source-of-truth store.
- Keep observed, derived, inferred, conflicting, ambiguous and incomplete observations distinct.
- Missing evidence is a gap, not evidence of absence.
- Reuse existing provider, controller, CLI and MCP interfaces; do not add a second MCP server or analysis engine.
- Keep graph import/export deterministic, idempotent and bounded (100,000 nodes and 250,000 edges, matching the reviewed PR #29 draft limits).
- Passing checks cover declared inputs only and do not establish universal equivalence.
- Keep the MIT license, existing copyright notices and third-party attribution; do not redistribute target binaries or assets.
- Mark unsupported or unavailable real-provider execution as **BLOCKED — NOT EXECUTED**.

## Review Focus

- Evidence with a different target hash must be rejected; test wrong-binary rejection in Task 2.
- Duplicate Evidence IDs with conflicting content must fail; test in Task 2.
- Equal virtual addresses without module/load identity must not imply a match; test ambiguous mapping in Task 2.
- Missing or dangling Evidence references in a graph/checkpoint must fail closed; test in Tasks 2 and 3.
- Partial or truncated provider observations and graph budget exhaustion must remain incomplete or fail boundedly; test in Tasks 2 and 3.

---

### Task 1: Establish the exact implementation baseline

**Files:**

- Read: repository `AGENTS.md`, `package.json`, existing graph, Evidence, autonomy, CLI, MCP, and test files.
- Copy: approved spec and this plan into the checkout at `docs/superpowers/`.

**Interfaces:**

- Consumes: approved spec and audit; current `develop`.
- Produces: a local checkout on a new feature branch, a recorded base SHA, and a baseline check report.

- [x] Checked out `develop` at `213bf08ad82f5ca270604efbe650638076e88d47` in `/workspace/re-agent-worktree` on `feat/behavioral-evidence-graph-integration`.
- [x] Reviewed repository instructions, existing evidence/native/JavaScript graph and autonomy paths, and PR #29 draft against the checked out base; implementation reuses existing Evidence and graph producers.
- [x] Ran `npm ci`, `npm run check:fast`, and `npm run test:fast` after `npm run test:prepare`. Baseline: 472 files passed, 7 failed (10 tests), 5 skipped; detailed failures are in `docs/audits/re-agent-2026-10-15.json`.
- [x] Checkout and dependencies succeeded; baseline failures were recorded separately.

**Commit:** No commit; this task establishes and verifies the baseline.

### Task 2: Define and test the bounded graph contract

**Files:**

- Create or update: `src/domain/reconstruction/BehavioralEvidenceGraph.ts`
- Test: `tests/boundary/filesystem/BehavioralEvidenceGraph.test.ts`
- Reuse: `src/domain/evidence.ts`, `src/domain/native/nativeInvestigationGraph.ts`, and the existing JavaScript application graph types.

**Interfaces:**

- Consumes: immutable `Evidence` IDs and the approved graph requirements.
- Produces:
  - `createEmptyBehavioralGraph(binarySha256: string): BehavioralGraph`
  - `validateBehavioralGraph(input: unknown): BehavioralGraph`
  - `mergeBehavioralGraphs(left: unknown, right: unknown): BehavioralGraph`
  - `queryBehavioralEvidence(graph: unknown, nodeId: string): BehavioralEvidenceQuery`, where `BehavioralEvidenceQuery` is `{ nodeId: string; supportingEvidenceIds: readonly string[]; contradictingEvidenceIds: readonly string[]; unresolvedEdges: readonly BehavioralGraphEdge[]; coverage: readonly BehavioralGraphCoverage[]; limitations: readonly string[] }`.

- [x] Added graph contract tests for identity, deterministic IDs, references, conflicts, unresolved relations, and bounded input.
- [x] Added contract tests before implementation; focused graph tests pass.
- [x] Implemented strict Zod schemas, exact binary identity and 100,000/250,000 bounds.
- [x] Implemented deterministic idempotent merge and conflict rejection.
- [x] Implemented bounded node query with support, contradiction, unresolved edges, coverage and limitations.
- [x] Focused graph and projection tests passed; full graph/autonomy focused run passed (28 tests).

**Commit:** `feat(reconstruction): add validated behavioral graph contract`

### Task 3: Project existing Evidence into the unified graph

**Files:**

- Create: `src/application/investigation/BehavioralGraphProjection.ts`
- Modify if required: `src/domain/evidence.ts` and existing producer adapters only where a typed module-relative location is needed.
- Test: `tests/boundary/filesystem/BehavioralGraphProjection.test.ts`

**Interfaces:**

- Consumes: `BehavioralGraph`, immutable `Evidence[]`, `NativeInvestigationGraph[]`, and authenticated `ApplicationGraphEvidenceSource[]`.
- Produces:
  - `BehavioralEvidenceProjectionInput` with `records: readonly Evidence[]`, `nativeGraphs: readonly NativeInvestigationGraph[]`, and `applicationSources: readonly ApplicationGraphEvidenceSource[]`.
  - `projectEvidenceToBehavioralGraph(targetSha256: string, input: BehavioralEvidenceProjectionInput): BehavioralGraph`

- [x] Added projection tests for exact identity, evidence references, idempotence, conflicting records, process identity, and native graph limitations.
- [ ] Add location tests: equal explicit module-relative locations may correlate; file offsets must not be treated as virtual addresses; addresses without module/load identity remain ambiguous when relocation is required.
- [ ] Run `npx vitest run tests/boundary/filesystem/BehavioralGraphProjection.test.ts` and confirm expected failures.
- [x] Implemented a derived projection over authenticated Evidence; specialized graph records are handled with explicit provenance and limitations.
- [ ] Preserve provider name/version, analysis profile, raw-result availability, confidence, relationship coverage, limitations and source Evidence links.
- [ ] Reject wrong-binary Evidence and dangling Evidence references. Represent missing locations, unsupported operations, truncated records and uncertain address mappings as unresolved/incomplete.
- [ ] Rerun projection tests plus `src/domain/evidence.test.ts`, native graph tests, and JavaScript graph boundary tests.

**Commit:** `feat(reconstruction): project provider Evidence into behavioral graph`

### Task 4: Persist and expose the graph through existing investigation paths

**Files:**

- Modify: `src/application/autonomy/InvestigationContracts.ts`
- Modify: `src/application/autonomy/AutonomousInvestigation.ts`
- Modify: `src/cli/autonomyCommands.ts`
- Test: `src/application/autonomy/AutonomousInvestigation.test.ts`, `tests/acceptance/autonomy.test.ts`, and existing MCP investigation tests if the returned status shape changes.

**Interfaces:**

- Consumes: Task 2 graph contract and Task 3 projection.
- Produces: an authenticated `behavioralGraph` in investigation state/status, derived from that state's exact Evidence set and target SHA-256.

- [ ] Add failing checkpoint tests for graph persistence, deterministic recomputation, legacy checkpoints without a graph, unsupported graph versions, wrong-binary graph state and missing Evidence references.
- [ ] Run the focused autonomy test and confirm the new assertions fail.
- [x] Added graph state to investigation creation and atomic Evidence recording.
- [x] Checkpoint loading validates graph identity and reconstructs legacy state deterministically from authenticated Evidence.
- [x] CLI summary and existing MCP autonomous status expose validated graph data; no new server/tool added.
- [ ] Test save/reopen, pause/resume, duplicate Evidence, checkpoint tampering, and graph/Evidence mismatch. Rerun focused autonomy and MCP boundary tests.

**Commit:** `feat(autonomy): persist behavioral graph in investigation status`

### Task 5: Verify the provider-backed path and document its limits

**Files:**

- Modify: `docs/autonomous-reconstruction.md`, `docs/mcp-contracts.md`
- Test/fixture: existing `tests/fixtures/autonomy/branch-calibration.c`, `scripts/verify-autonomous-reconstruction.mjs`, and focused integration tests.

**Interfaces:**

- Consumes: persisted graph status from Task 4 and existing static/runtime execution paths.
- Produces: reproducible evidence that static-provider and owned-process observations for one compiled fixture are retained in the same binary-bound graph.

- [ ] Provider-backed compiled-native static plus runtime join is BLOCKED — NOT EXECUTED (radare2/clang unavailable). The CLI owned-process acceptance scenario verifies exact manifest identity and checkpoint provenance, not native static analysis.
- [ ] Rerun build and the focused CLI acceptance test after the final process-identity changes; preserve provider-backed native analysis as BLOCKED — NOT EXECUTED.
- [ ] Run final `npm run check:fast`, relevant focused/boundary tests and docs checks. Full fast suite has known baseline failures; compare new results against baseline.
- [x] Documented graph schema, persistence and limitations; unavailable native providers and platform capabilities are labeled BLOCKED — NOT EXECUTED.
- [ ] Create one focused PR against `develop` after final review; report commands/results and blocked capabilities. Do not close issue #25 unless its full acceptance criteria are met.

**Commit:** `docs(reconstruction): document behavioral graph evidence workflow`

---

## Self-review

- **Spec coverage:** graph identity/schema, Evidence provenance, ambiguity/conflicts, deterministic import/export, bounded growth, checkpoint/reopen, CLI/MCP integration, test coverage, limitations and licensing are assigned to Tasks 1–5.
- **Existing systems:** native and JavaScript graph workflows plus the EvidenceLedger remain authoritative and are reused; this slice adds only the cross-provider projection.
- **Limits:** the compiled fixture verifies a narrow provider path. It is not a real legacy maintenance case study and does not prove universal equivalence.
- **Current blocker:** the workspace still lacks the repository checkout. The managed environment reports unrestricted policy, but `git clone` fails to connect to `proxy:8080`; implementation cannot begin until a local checkout can be obtained.
