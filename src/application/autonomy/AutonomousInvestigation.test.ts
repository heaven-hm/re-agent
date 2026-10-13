import {
  link,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
