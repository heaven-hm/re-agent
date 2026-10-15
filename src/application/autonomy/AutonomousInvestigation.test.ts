import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as graphProjection from "../investigation/BehavioralGraphProjection.js";
import { createEvidence } from "../../domain/evidence.js";
import { parseApplicationGraphEvidence } from "../javascript/JavaScriptApplicationEvidenceGraph.js";
import { analyzeJavaScriptApplication } from "../../../tests/support/javascriptApplicationScope.js";
import { createPackageWithOptions } from "@electron/asar";
import {
  AutonomousInvestigation,
  investigationConfigSchema,
  parseInvestigationState,
} from "./AutonomousInvestigation.js";
import { InvestigationWorkspace } from "./InvestigationWorkspace.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "rea-autonomous-"));
  roots.push(root);
  const original = join(root, "original.cjs");
  const replica = join(root, "replica.cjs");
  await writeFile(
    original,
    "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2)",
  );
  await writeFile(replica, "const x=Number(process.argv[2]);console.log(x*2)");
  return {
    root,
    original,
    replica,
    checkpoint: join(root, "checkpoint.json"),
    config: {
      binaryPath: process.execPath,
      workspace: root,
      original: { command: process.execPath, arguments: [original] },
      replica: { command: process.execPath, arguments: [replica] },
      cases: [
        { id: "positive", arguments: ["2"] },
        { id: "negative", arguments: ["-2"] },
      ],
      maxIterations: 2,
      timeoutMs: 5000,
    },
  };
};

describe("autonomous reconstruction checkpoint and workspace safety", () => {
  it("preserves a stop queued while an earlier pause is being persisted", async () => {
    const f = await fixture();
    await AutonomousInvestigation.create(f.checkpoint, f.config);
    await writeFile(
      `${f.checkpoint}.control.json`,
      JSON.stringify({ action: "pause" }),
    );
    const pause = AutonomousInvestigation.prototype.pause;
    const intercepted = vi
      .spyOn(AutonomousInvestigation.prototype, "pause")
      .mockImplementation(async function (this: AutonomousInvestigation) {
        await writeFile(
          `${f.checkpoint}.control.json`,
          JSON.stringify({ action: "stop" }),
        );
        await pause.call(this);
      });
    try {
      const resumed = await AutonomousInvestigation.open(f.checkpoint);
      expect(
        JSON.parse(await readFile(`${f.checkpoint}.control.json`, "utf8")),
      ).toEqual({ action: "stop" });
      expect((await resumed.run()).status).toBe("stopped");
    } finally {
      intercepted.mockRestore();
    }
  });

  it("rejects stale in-memory checkpoints without overwriting newer evidence", async () => {
    const f = await fixture();
    const stale = await AutonomousInvestigation.create(f.checkpoint, f.config);
    await AutonomousInvestigation.open(f.checkpoint);
    const before = await readFile(f.checkpoint, "utf8");
    await expect(stale.run()).rejects.toThrow("advanced since");
    expect(await readFile(f.checkpoint, "utf8")).toBe(before);
  });
  it("holds a live checkpoint lock and honors external pause controls", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    let started: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const running = agent.run({
      discover: async (_config, signal) => {
        started?.();
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return [];
      },
    });
    await ready;
    await expect(AutonomousInvestigation.open(f.checkpoint)).rejects.toThrow(
      "live owner",
    );
    await AutonomousInvestigation.requestControl(f.checkpoint, "pause");
    expect((await running).status).toBe("paused");
    expect(
      (await AutonomousInvestigation.open(f.checkpoint)).state.status,
    ).toBe("paused");
  }, 30000);
  it("repairs a failed initial reconstruction before retrying the build", async () => {
    const f = await fixture();
    await unlink(f.replica);
    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      build: { command: process.execPath, arguments: ["--check", f.replica] },
    });
    const state = await agent.run({
      reconstruct: async () => ({
        files: [{ path: f.replica, content: "const =;" }],
      }),
      repair: async (current) => {
        expect(
          current.history.some(
            (event) =>
              event.event === "build-failure" &&
              event.detail.includes("SyntaxError"),
          ),
        ).toBe(true);
        return {
          files: [
            {
              path: f.replica,
              content:
                "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2)",
            },
          ],
        };
      },
    });
    expect(state.status).toBe("suite-passed");
    expect(
      state.evidence.some(
        (evidence) => evidence.operation === "build_reconstruction",
      ),
    ).toBe(true);
  }, 30000);

  it("replaces hardlinked candidate paths without modifying original bytes", async () => {
    const f = await fixture();
    await unlink(f.replica);
    await link(f.original, f.replica);
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const original = await readFile(f.original, "utf8");
    const workspace = new InvestigationWorkspace(
      agent.state,
      f.checkpoint,
      async () => {},
      (evidence) => {
        agent.state.evidence.push(evidence);
        return evidence;
      },
    );
    await workspace.apply({
      files: [{ path: f.replica, content: "new replica" }],
    });
    expect(await readFile(f.original, "utf8")).toBe(original);
    expect(await readFile(f.replica, "utf8")).toBe("new replica");
    await workspace.rollback();
    expect(await readFile(f.replica, "utf8")).toBe(original);
  });

  it("rejects unsupported checkpoint success claims and changed argument artifacts", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    expect(() =>
      parseInvestigationState({ ...agent.state, status: "suite-passed" }),
    ).toThrow("lacks complete");
    await writeFile(f.original, "console.log('changed original')");
    await expect(AutonomousInvestigation.open(f.checkpoint)).rejects.toThrow(
      "argument artifact changed",
    );
  });
});

describe("autonomous application graph checkpoint integration", () => {
  it("persists authenticated application nodes and relationships through checkpoint reload", async () => {
    const f = await fixture();
    const applicationSource = join(f.root, "application");
    await mkdir(applicationSource);
    await writeFile(
      join(applicationSource, "main.mjs"),
      'import { helper } from "./helper.mjs";\nexport const value = helper();\n',
    );
    await writeFile(
      join(applicationSource, "helper.mjs"),
      "export const helper = () => 7;\n",
    );
    const applicationPath = join(f.root, "application.asar");
    await createPackageWithOptions(applicationSource, applicationPath, {
      unpack: "**/*.node",
    });
    const analysis = await analyzeJavaScriptApplication({
      input_path: applicationPath,
      format: "asar",
    });
    if (!analysis.ok) throw analysis.error;
    const parsedSource = parseApplicationGraphEvidence(analysis.value);
    if (!parsedSource.ok)
      throw new Error("Application Evidence must authenticate");
    expect(parsedSource.value.graph.edges.length).toBeGreaterThan(0);

    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      // Model the real Electron arrangement: the command executable and its
      // separately analyzed ASAR are different immutable artifacts.
      applicationArtifactSha256s: [parsedSource.value.rootArtifactSha256],
    });
    expect(agent.state.binarySha256).not.toBe(
      parsedSource.value.rootArtifactSha256,
    );
    await expect(
      agent.run({
        discover: async () => [parsedSource.value.evidence],
        reconstruct: async (state) => {
          expect(state.behavioralGraph?.nodes.length).toBeGreaterThan(
            parsedSource.value.graph.nodes.length,
          );
          expect(state.behavioralGraph?.edges).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ relation: "imports" }),
            ]),
          );
          throw new Error("stop after checking checkpoint graph");
        },
      }),
    ).rejects.toThrow("stop after checking checkpoint graph");

    const reopened = await AutonomousInvestigation.open(f.checkpoint);
    expect(reopened.state.behavioralGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "imports" }),
      ]),
    );
    expect(reopened.state.behavioralGraph?.nodes.length).toBeGreaterThan(
      parsedSource.value.graph.nodes.length,
    );
  });

  it("does not bind a different application artifact without explicit target scope", async () => {
    const f = await fixture();
    const applicationSource = join(f.root, "unbound-application");
    await mkdir(applicationSource);
    await writeFile(
      join(applicationSource, "main.mjs"),
      "export const value = 7;\n",
    );
    const applicationPath = join(f.root, "unbound-application.asar");
    await createPackageWithOptions(applicationSource, applicationPath, {
      unpack: "**/*.node",
    });
    const analysis = await analyzeJavaScriptApplication({
      input_path: applicationPath,
      format: "asar",
    });
    if (!analysis.ok) throw analysis.error;
    const parsedSource = parseApplicationGraphEvidence(analysis.value);
    if (!parsedSource.ok)
      throw new Error("Application Evidence must authenticate");

    const agent = await AutonomousInvestigation.create(
      join(f.root, "unbound-checkpoint.json"),
      f.config,
    );
    expect(agent.state.binarySha256).not.toBe(
      parsedSource.value.rootArtifactSha256,
    );
    await expect(
      agent.run({
        discover: async () => [parsedSource.value.evidence],
        reconstruct: async (state) => {
          expect(state.behavioralGraph?.evidenceIds).not.toContain(
            parsedSource.value.evidence.evidence_id,
          );
          expect(state.behavioralGraph?.edges).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ relation: "imports" }),
            ]),
          );
          throw new Error("stop after verifying no implicit binding");
        },
      }),
    ).rejects.toThrow("stop after verifying no implicit binding");
  });
});

describe("autonomous application graph checkpoint compatibility", () => {
  it("reopens and upgrades the generic graph projection written by pre-fix checkpoints", async () => {
    const f = await fixture();
    const applicationSource = join(f.root, "application");
    await mkdir(applicationSource);
    await writeFile(
      join(applicationSource, "main.mjs"),
      'import { helper } from "./helper.mjs";\nexport const value = helper();\n',
    );
    await writeFile(
      join(applicationSource, "helper.mjs"),
      "export const helper = () => 7;\n",
    );
    const applicationPath = join(f.root, "application.asar");
    await createPackageWithOptions(applicationSource, applicationPath, {
      unpack: "**/*.node",
    });
    const analysis = await analyzeJavaScriptApplication({
      input_path: applicationPath,
      format: "asar",
    });
    if (!analysis.ok) throw analysis.error;
    const parsedSource = parseApplicationGraphEvidence(analysis.value);
    if (!parsedSource.ok)
      throw new Error("Application Evidence must authenticate");
    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      binaryPath: applicationPath,
      original: { command: applicationPath, arguments: [] },
    });
    const legacyGraph = graphProjection.projectEvidenceToBehavioralGraph(
      agent.state.binarySha256,
      {
        records: [parsedSource.value.evidence],
        nativeGraphs: [],
        applicationSources: [],
        nonTargetEvidence: "exclude-with-coverage",
      },
    );
    const legacyCheckpoint = JSON.parse(
      JSON.stringify({
        ...agent.state,
        evidence: [parsedSource.value.evidence],
        behavioralGraph: legacyGraph,
      }),
    );

    await writeFile(f.checkpoint, JSON.stringify(legacyCheckpoint));
    const reopened = await AutonomousInvestigation.open(f.checkpoint);
    expect(reopened.state.behavioralGraph?.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "imports" }),
      ]),
    );
    const persisted = parseInvestigationState(
      JSON.parse(await readFile(f.checkpoint, "utf8")),
    );
    expect(persisted.behavioralGraph?.edges).toEqual(
      reopened.state.behavioralGraph?.edges,
    );
  });
});

describe("autonomous behavioral graph checkpoint binding", () => {
  it("projects a discovery batch once before saving its authenticated checkpoint", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const records = Array.from({ length: 30 }, (_, index) =>
      createEvidence(
        {
          path: f.config.binaryPath,
          sha256: agent.state.binarySha256,
          format: "unknown",
        },
        { id: "batch-test", name: "Batch Test", version: "1" },
        {
          operation: "batch_observation",
          parameters: { index },
          result: { index },
        },
      ),
    );
    const projection = vi.spyOn(
      graphProjection,
      "projectEvidenceToBehavioralGraph",
    );
    try {
      await expect(
        agent.run({
          discover: async () => records,
          reconstruct: async (state) => {
            expect(state.behavioralGraph?.evidenceIds).toHaveLength(
              records.length,
            );
            throw new Error("stop after discovery");
          },
        }),
      ).rejects.toThrow("stop after discovery");
      expect(
        projection.mock.calls.filter(
          ([, input]) => input.records.length === records.length,
        ),
      ).toHaveLength(1);
      const persisted = parseInvestigationState(
        JSON.parse(await readFile(f.checkpoint, "utf8")),
      );
      expect(persisted.behavioralGraph?.nodes).toHaveLength(records.length);
      expect(persisted.behavioralGraph?.evidenceIds).toEqual(
        agent.state.behavioralGraph?.evidenceIds,
      );
    } finally {
      projection.mockRestore();
    }
  });

  it("reconstructs a missing behavioral graph from authenticated checkpoint Evidence", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const record = createEvidence(
      {
        path: f.config.binaryPath,
        sha256: agent.state.binarySha256,
        format: "unknown",
      },
      { id: "checkpoint-test", name: "Checkpoint Test", version: "1" },
      {
        operation: "checkpoint_observation",
        parameters: {},
        result: { ok: true },
        limitations: ["x".repeat(9000)],
      },
    );
    const restored = parseInvestigationState({
      ...agent.state,
      evidence: [record],
      behavioralGraph: undefined,
    });
    expect(restored.evidence[0]?.limitations[0]).toHaveLength(9000);
    expect(
      restored.behavioralGraph?.limitations.some((value) =>
        value.includes("truncated"),
      ),
    ).toBe(true);
    expect(restored.behavioralGraph?.evidenceIds).toEqual([record.evidence_id]);
    expect(restored.behavioralGraph?.targetSha256).toBe(
      agent.state.binarySha256,
    );
  });

  it("rejects a checkpoint graph that changes target identity or loses Evidence references", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const record = createEvidence(
      {
        path: f.config.binaryPath,
        sha256: agent.state.binarySha256,
        format: "unknown",
      },
      { id: "checkpoint-test", name: "Checkpoint Test", version: "1" },
      {
        operation: "checkpoint_observation",
        parameters: {},
        result: { ok: true },
      },
    );
    const state = parseInvestigationState({
      ...agent.state,
      evidence: [record],
      behavioralGraph: undefined,
    });
    expect(() =>
      parseInvestigationState({
        ...state,
        behavioralGraph: {
          ...state.behavioralGraph,
          targetSha256: "c".repeat(64),
        },
      }),
    ).toThrow();
    expect(() =>
      parseInvestigationState({
        ...state,
        behavioralGraph: {
          ...state.behavioralGraph,
          evidenceIds: [],
        },
      }),
    ).toThrow(/Evidence reference|does not match/iu);
  });
});

describe("autonomous reconstruction cancellation and resume", () => {
  it("resumes an interrupted final iteration without consuming another attempt", async () => {
    const f = await fixture();
    await writeFile(
      f.replica,
      "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2)",
    );
    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      maxIterations: 1,
      build: {
        command: process.execPath,
        arguments: ["-e", "setTimeout(()=>{},350)"],
      },
    });
    const running = agent.run();
    while (agent.state.iteration === 0)
      await new Promise((resolve) => setTimeout(resolve, 5));
    await agent.pause();
    expect((await running).status).toBe("paused");
    const resumed = await AutonomousInvestigation.open(f.checkpoint);
    expect((await resumed.resume()).status).toBe("suite-passed");
    expect(resumed.state.iteration).toBe(1);
  }, 30000);

  it("rolls back interrupted candidate bytes and replays them on resume", async () => {
    const f = await fixture();
    const before = await readFile(f.replica, "utf8");
    const candidate =
      "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2)";
    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      maxIterations: 1,
      build: {
        command: process.execPath,
        arguments: ["-e", "setTimeout(()=>{},350)"],
      },
    });
    const running = agent.run({
      reconstruct: async () => ({
        files: [{ path: f.replica, content: candidate }],
      }),
    });
    while (agent.state.iteration === 0)
      await new Promise((resolve) => setTimeout(resolve, 5));
    await agent.pause();
    await running;
    expect(await readFile(f.replica, "utf8")).toBe(before);
    const resumed = await AutonomousInvestigation.open(f.checkpoint);
    expect((await resumed.resume()).status).toBe("suite-passed");
    expect(await readFile(f.replica, "utf8")).toBe(candidate);
  }, 30000);

  it("consumes a queued stop before invoking any execution hooks", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    await writeFile(
      `${f.checkpoint}.control.json`,
      JSON.stringify({ action: "stop" }),
    );
    const state = await agent.run({
      discover: async () => {
        throw new Error("must not launch");
      },
    });
    expect(state.status).toBe("stopped");
    expect(state.iteration).toBe(0);
    expect(state.evidence).toHaveLength(0);
  });

  it("persists inactive stop and rejects resume without launching hooks", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    await agent.pause();
    await AutonomousInvestigation.requestControl(f.checkpoint, "stop");
    const resumed = await AutonomousInvestigation.open(f.checkpoint);
    expect(resumed.state.status).toBe("stopped");
    await expect(
      resumed.resume({
        discover: async () => {
          throw new Error("must not launch");
        },
      }),
    ).rejects.toThrow("cannot resume");
    expect(resumed.state.evidence).toHaveLength(0);
  });
});

describe("autonomous reconstruction differential controller", () => {
  it("rejects matching output with a different replica exit code", async () => {
    const f = await fixture();
    await writeFile(
      f.replica,
      "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2);process.exitCode=7",
    );
    const agent = await AutonomousInvestigation.create(f.checkpoint, {
      ...f.config,
      maxIterations: 1,
    });
    const state = await agent.run();
    expect(state.status).toBe("budget-exhausted");
    expect(state.results.every((item) => item.status === "fail")).toBe(true);
    expect(
      state.evidence.some(
        (item) => item.operation === "compare_process_exit_outcomes",
      ),
    ).toBe(true);
  }, 30000);

  it("preserves an immediate startup pause after lock acquisition", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const running = agent.run();
    await agent.pause();
    expect((await running).status).toBe("paused");
    expect(
      (await AutonomousInvestigation.open(f.checkpoint)).state.status,
    ).toBe("paused");
  }, 30000);

  it("records real differential failures, repairs, and retains a regression corpus", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const state = await agent.run({
      repair: async (current) => {
        expect(
          current.results.find((result) => result.caseId === "negative")
            ?.status,
        ).toBe("fail");
        expect(current.evidence.length).toBeGreaterThanOrEqual(6);
        return {
          files: [
            {
              path: f.replica,
              content:
                "const x=Number(process.argv[2]);console.log(x<0?x*3:x*2)",
            },
          ],
        };
      },
    });
    expect(
      state.status,
      JSON.stringify(
        state.evidence
          .filter((e) => e.operation === "compare_process_captures")
          .map((e) => e.normalized_result),
      ),
    ).toBe("suite-passed");
    expect(state.regressions).toEqual(["negative"]);
    expect(
      state.history.some((entry) => entry.event === "candidate-retained"),
    ).toBe(true);
    expect(
      (await AutonomousInvestigation.open(f.checkpoint)).state.results,
    ).toEqual(state.results);
  }, 30000);

  it("rejects a repair that regresses previously passing cases and restores source bytes", async () => {
    const f = await fixture();
    const before = await readFile(f.replica, "utf8");
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    const state = await agent.run({
      repair: async () => ({
        files: [{ path: f.replica, content: "console.log(-6)" }],
      }),
    });
    expect(state.status).toBe("budget-exhausted");
    expect(await readFile(f.replica, "utf8")).toBe(before);
    expect(
      state.results.find((result) => result.caseId === "positive")?.status,
    ).toBe("pass");
    expect(state.history.some((entry) => entry.event === "rollback")).toBe(
      true,
    );
  }, 30000);

  it("validates unique cases and refuses checkpoint rebinding", async () => {
    const f = await fixture();
    expect(() =>
      investigationConfigSchema.parse({
        ...f.config,
        cases: [{ id: "same" }, { id: "same" }],
      }),
    ).toThrow();
    expect(() =>
      investigationConfigSchema.parse({
        ...f.config,
        applicationArtifactSha256s: ["a".repeat(64), "a".repeat(64)],
      }),
    ).toThrow(/must be unique/u);
    expect(() =>
      investigationConfigSchema.parse({
        ...f.config,
        applicationArtifactSha256s: ["not-a-digest"],
      }),
    ).toThrow();
    await AutonomousInvestigation.create(f.checkpoint, f.config);
    await expect(
      AutonomousInvestigation.create(f.checkpoint, f.config),
    ).rejects.toThrow("already exists");
    const saved = JSON.parse(await readFile(f.checkpoint, "utf8")) as {
      binarySha256: string;
    };
    saved.binarySha256 = "0".repeat(64);
    await writeFile(f.checkpoint, JSON.stringify(saved));
    await expect(AutonomousInvestigation.open(f.checkpoint)).rejects.toThrow(
      "Original binary changed",
    );
  });

  it("rejects candidate files outside the replica workspace", async () => {
    const f = await fixture();
    const agent = await AutonomousInvestigation.create(f.checkpoint, f.config);
    await expect(
      agent.run({
        repair: async () => ({
          files: [{ path: join(f.root, "..", "escape.c"), content: "bad" }],
        }),
      }),
    ).rejects.toThrow("escapes");
  }, 30000);
});
