import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { executeWorkflowFixture } from "../../support/workflowGit.js";

const workflow = async (filename = "ci.yml") =>
  z
    .object({
      jobs: z.record(
        z.string(),
        z
          .object({
            needs: z.union([z.string(), z.array(z.string())]).optional(),
          })
          .passthrough(),
      ),
    })
    .parse(
      parse(
        await readFile(
          new URL(`../../../.github/workflows/${filename}`, import.meta.url),
          "utf8",
        ),
      ),
    );

it("binds SQLite compatibility jobs to the build's prepared runtime artifact and root layout", async () => {
  const steps = z.array(
    z.object({
      uses: z.string().optional(),
      with: z
        .object({ name: z.string().optional(), path: z.string().optional() })
        .optional(),
    }),
  );
  const uploads = steps.parse((await workflow()).jobs.build?.steps).filter(
    (step) =>
      step.uses?.startsWith("actions/upload-artifact@") &&
      step.with?.path
        ?.split(/\r?\n/u)
        .map((path) => path.trim())
        .includes("dist/"),
  );
  expect(uploads).toHaveLength(1);
  const name = z.string().min(1).parse(uploads[0]?.with?.name);
  const downloads = steps
    .parse((await workflow("sqlite-runtime.yml")).jobs.sqlite?.steps)
    .filter((step) => step.uses?.startsWith("actions/download-artifact@"));
  expect(downloads).toHaveLength(1);
  expect(downloads[0]?.with).toEqual({ name, path: "." });
});

const requiredNeeds = async () => {
  const { jobs } = await workflow();
  return { jobs, needs: z.array(z.string()).parse(jobs.required?.needs) };
};

it("makes the required gate wait for every CI lane, including future additions", async () => {
  const { jobs, needs } = await requiredNeeds();
  expect(new Set(needs)).toEqual(
    new Set(Object.keys(jobs).filter((name) => name !== "required")),
  );
});

it("leaves cancellation ownership with CI so child lanes cannot cancel another tier", async () => {
  const { jobs } = await workflow();
  const children = Object.values(jobs).flatMap((job) =>
    typeof job.uses === "string" && job.uses.startsWith("./.github/workflows/")
      ? [job.uses]
      : [],
  );
  expect(children.length).toBeGreaterThan(0);
  for (const path of children) {
    const child = z
      .object({ concurrency: z.unknown().optional() })
      .parse(
        parse(
          await readFile(new URL(`../../../${path}`, import.meta.url), "utf8"),
        ),
      );
    expect(
      child.concurrency,
      `${path} must use caller scheduling`,
    ).toBeUndefined();
  }
});

it("keeps fast feedback separate from complete qualification and release proof", async () => {
  const ci = z
    .object({
      on: z.object({
        push: z.unknown(),
        pull_request: z.unknown(),
        schedule: z.array(z.object({ cron: z.string() })),
        workflow_call: z.object({
          inputs: z.object({
            source_sha: z.object({
              required: z.literal(true),
              type: z.literal("string"),
            }),
          }),
        }),
      }),
      concurrency: z.object({
        group: z.string(),
        "cancel-in-progress": z.string(),
      }),
      jobs: z.record(
        z.string(),
        z.object({
          if: z.string().optional(),
          steps: z
            .array(
              z.object({
                run: z.string().optional(),
                if: z.string().optional(),
                with: z.record(z.string(), z.unknown()).optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .parse(
      parse(
        await readFile(
          new URL("../../../.github/workflows/ci.yml", import.meta.url),
          "utf8",
        ),
      ),
    );
  expect(ci.on.schedule).toEqual([{ cron: "23 * * * *" }]);
  expect(ci.concurrency.group).toContain("'qualification' || 'feedback'");
  expect(ci.concurrency.group).toContain("inputs.source_sha ||");
  for (const fullEvent of ["schedule", "workflow_dispatch"])
    expect(ci.concurrency["cancel-in-progress"]).toContain(
      `github.event_name != '${fullEvent}'`,
    );
  expect(ci.concurrency["cancel-in-progress"]).toContain(
    "inputs.source_sha == ''",
  );
  expect(ci.jobs.required?.if).toBe("${{ always() }}");
  const shards = ci.jobs["test-shard"]?.steps ?? [];
  const fast = shards.find((step) => step.run?.includes("npm run test:run"));
  const full = shards.find((step) => step.run?.includes("test:ci:shard:run"));
  expect(fast?.if).toBe("needs.changes.outputs.tier == 'fast'");
  expect(fast?.run).toContain("--reporter=blob");
  expect(fast?.run).not.toContain("--coverage");
  expect(full?.if).toBe("needs.changes.outputs.tier == 'full'");
  const proof = ci.jobs["package-e2e"]?.steps?.find(
    (step) => step.with?.name === "verified-release-package",
  );
  expect(proof?.if).toContain("needs.changes.outputs.tier == 'full'");
  expect(proof?.if).toContain("matrix.platform == 'linux'");
  expect(proof?.if).toContain("matrix.architecture == 'x64'");
});

it.each([
  ["true", "success", true],
  ["true", "failure", false],
  ["true", "cancelled", false],
  ["true", "skipped", false],
  ["true", "missing", false],
  ["false", "skipped", true],
] as const)(
  "enforces the SQLite required gate for code=%s and result=%s",
  async (code, result, passes) => {
    const workflow = await requiredNeeds();
    // GitHub exposes only direct dependencies in the required job's needs context.
    const needs: Record<
      string,
      { result: string; outputs?: Record<string, string> }
    > = Object.fromEntries(
      workflow.needs.map((name) => [name, { result: "success" }]),
    );
    needs.changes = { result: "success", outputs: { code } };
    if (result === "missing") delete needs["sqlite-runtime"];
    else if ("sqlite-runtime" in needs) needs["sqlite-runtime"] = { result };
    const execution = executeWorkflowFixture(
      process.execPath,
      [
        fileURLToPath(
          new URL("../../../scripts/ci/required.mjs", import.meta.url),
        ),
      ],
      { env: { ...process.env, CI_JOBS: JSON.stringify(needs) } },
    );
    if (passes) await expect(execution).resolves.toMatchObject({ stderr: "" });
    else
      await expect(execution).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining("sqlite-runtime"),
      });
  },
);
