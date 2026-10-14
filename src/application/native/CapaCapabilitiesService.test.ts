import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CapaCapabilitiesService } from "./CapaCapabilitiesService.js";
import {
  CapaCapabilityProvider,
  type CapaRunner,
} from "../../capa/CapaCapabilityProvider.js";
import { pe, thinMach } from "../../domain/binaryTarget.fixture.js";
import { parseEvidence } from "../../domain/evidence.js";
import { OwnedCommandFailure } from "../../process/OwnedCommand.js";
import type {
  ProviderProcessSnapshot,
  ProviderProcessSupervisor,
} from "../../process/ProviderProcess.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const output = (text: string): ProviderProcessSnapshot => ({
  stdout: {
    text,
    bytes: Buffer.byteLength(text),
    observedBytes: Buffer.byteLength(text),
  },
  stderr: { text: "", bytes: 0, observedBytes: 0 },
  exitCode: 0,
  signal: null,
});
async function fixture(
  mutate: (report: Record<string, unknown>) => void = () => {},
) {
  const root = await mkdtemp(join(tmpdir(), "rea-capa-test-"));
  directories.push(root);
  const path = join(root, "original.exe"),
    tool = join(root, "capa");
  const bytes = pe(0x14c);
  await writeFile(path, bytes);
  await writeFile(tool, thinMach(0xfeedfacf, 0x0100000c));
  const digest = createHash("sha256").update(bytes).digest("hex");
  let snapshot = "";
  const runner: CapaRunner = async (spawn) => {
    if (spawn.arguments[0] === "--version") return output("capa 9.4.0\n");
    snapshot = spawn.arguments.at(-1) ?? "";
    expect(snapshot).not.toBe(path);
    expect(await readFile(snapshot)).toEqual(bytes);
    const report: Record<string, unknown> = {
      meta: {
        version: "9.4.0",
        flavor: "static",
        sample: { sha256: digest },
        analysis: { format: "pe", extractor: "VivisectFeatureExtractor" },
      },
      rules: {
        "read file": {
          meta: {
            name: "read file",
            namespace: "io/file",
            scopes: { static: "function" },
          },
          matches: [[{ type: "absolute", value: 4198400 }, {}]],
        },
      },
    };
    mutate(report);
    return output(JSON.stringify(report));
  };
  const provider = new CapaCapabilityProvider({ REA_CAPA_PATH: tool }, runner);
  return {
    path,
    tool,
    bytes,
    digest,
    provider,
    service: new CapaCapabilitiesService(provider),
    runner,
    snapshot: () => snapshot,
  };
}

describe("capa shared capability workflow", () => {
  it("retains derived hypotheses and source identity while removing its private snapshot", async () => {
    const f = await fixture();
    const result = await f.service.inspect({ path: f.path });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const evidence = parseEvidence(result.value);
      expect(evidence.confidence).toBe("derived");
      expect(evidence.subject?.digest.sha256).toBe(f.digest);
      expect(evidence.analysis_profile?.parameters.backend).toBe("auto");
      expect(evidence.normalized_result).toMatchObject({
        classification: "static-rule-hypotheses",
        rules: [
          {
            name: "read file",
            scope: "function",
            matches: [{ type: "absolute", value: 4198400 }],
          },
        ],
      });
    }
    await expect(access(f.snapshot())).rejects.toThrow();
    expect(await readFile(f.path)).toEqual(f.bytes);
    await f.service.close();
  });
  it("preserves an explicitly address-free file match without inventing a null coordinate", async () => {
    const f: Awaited<ReturnType<typeof fixture>> = await fixture((report) => {
      report.rules = {
        "debug build": {
          meta: { name: "debug build", scopes: { static: "file" } },
          matches: [[{ type: "no address" }, {}]],
        },
      };
    });
    const result = await f.service.inspect({ path: f.path });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.normalized_result).toMatchObject({
        rules: [{ matches: [{ type: "no address" }] }],
      });
    await f.service.close();
  });
  it.each(["digest", "flavor", "version", "location"])(
    "rejects changed %s output without success evidence",
    async (mode) => {
      const f = await fixture((report) => {
        if (mode === "location")
          report.rules = {
            "read file": {
              meta: { name: "read file", scopes: { static: "function" } },
              matches: [["fabricated", {}]],
            },
          };
        else
          report.meta = {
            version: mode === "version" ? "wrong" : "9.4.0",
            flavor: mode === "flavor" ? "dynamic" : "static",
            sample: { sha256: mode === "digest" ? "0".repeat(64) : f.digest },
            analysis: { format: "pe", extractor: "VivisectFeatureExtractor" },
          };
      });
      const result = await f.service.inspect({ path: f.path });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error._tag).toBe("AnalysisOutputError");
      await f.service.close();
    },
  );
});

describe("capa capability execution lifecycle", () => {
  it("rejects source mutation during the snapshot-backed experiment", async () => {
    const f = await fixture();
    const runner: CapaRunner = async (...args) => {
      const result = await f.runner(...args);
      if (args[0].arguments[0] !== "--version")
        await writeFile(f.path, Buffer.from("changed"));
      return result;
    };
    const provider = new CapaCapabilityProvider(
      { REA_CAPA_PATH: f.tool },
      runner,
    );
    const result = await new CapaCapabilitiesService(provider).inspect({
      path: f.path,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error._tag).toBe("AnalysisArtifactChangedError");
    await provider.close();
    await f.service.close();
  });
  it("maps cancellation and complete-output exhaustion to typed failures", async () => {
    for (const reason of ["cancelled", "output-limit"] as const) {
      const f = await fixture();
      const runner: CapaRunner = async () => {
        throw new OwnedCommandFailure(reason, "probe rejected");
      };
      const provider = new CapaCapabilityProvider(
        { REA_CAPA_PATH: f.tool },
        runner,
      );
      const result = await new CapaCapabilitiesService(provider).inspect({
        path: f.path,
      });
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.error._tag).toBe(
          reason === "cancelled"
            ? "AnalysisCancelledError"
            : "AnalysisOutputError",
        );
      await provider.close();
      await f.service.close();
    }
  });
  it("retains failed cleanup ownership and retries it before removing the snapshot", async () => {
    const f = await fixture();
    let stopped = false;
    const owner = {
      stop: async () =>
        stopped
          ? { status: "verified-cleanup" }
          : { status: "incomplete", reason: "retry needed" },
    } as unknown as ProviderProcessSupervisor;
    const runner: CapaRunner = async (spawn, limits, options) => {
      const result = await f.runner(spawn, limits, options);
      if (spawn.arguments[0] !== "--version") options.retainCleanup(owner);
      return result;
    };
    const provider = new CapaCapabilityProvider(
      { REA_CAPA_PATH: f.tool },
      runner,
    );
    const result = await new CapaCapabilitiesService(provider).inspect({
      path: f.path,
    });
    expect(result.ok).toBe(false);
    await expect(access(f.snapshot())).resolves.toBeUndefined();
    await expect(provider.close()).rejects.toMatchObject({
      cleanupIncomplete: true,
    });
    stopped = true;
    await provider.close();
    await expect(access(f.snapshot())).rejects.toThrow();
    await f.service.close();
  });
  it("rejects unconfigured engines, unknown arguments and exhausted input budget", async () => {
    const service = new CapaCapabilitiesService(new CapaCapabilityProvider({}));
    const missing = await service.inspect({ path: "/authorized/input.exe" });
    expect(missing.ok).toBe(false);
    if (!missing.ok)
      expect(missing.error._tag).toBe("AnalysisCapabilityUnavailableError");
    const unknown = await service.inspect({
      path: "/authorized/input.exe",
      inject: true,
    });
    expect(unknown.ok).toBe(false);
    await service.close();
    const f = await fixture();
    const large = await f.service.inspect({ path: f.path, max_file_bytes: 1 });
    expect(large.ok).toBe(false);
    await f.service.close();
  });
});
