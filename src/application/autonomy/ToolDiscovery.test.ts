import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autonomyTools,
  discoverTools,
  installPinnedExecutable,
} from "./ToolDiscovery.js";

describe("game analysis tool inventory", () => {
  it("discovers FFmpeg metrics and graphics trace replay independently", () => {
    expect(autonomyTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ffmpeg",
          capabilities: expect.arrayContaining(["game-frame-quality-metrics"]),
        }),
        expect.objectContaining({
          id: "apitrace",
          capabilities: expect.arrayContaining([
            "graphics-api-tracing",
            "graphics-trace-replay",
          ]),
        }),
        expect.objectContaining({ id: "renderdoc" }),
      ]),
    );
  });
});

describe("pinned standalone installation", () => {
  it("verifies bytes before execution, installs and reuses healthy executable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rea-tools-"));
    const bytes = Buffer.from("#!/bin/sh\necho integration-fixture\n");
    const destination = join(directory, "tool");
    let downloads = 0;
    const artifact = {
      url: "https://official.example/tool-v1",
      officialHosts: ["official.example"],
      sha256: createHash("sha256").update(bytes).digest("hex"),
      license: "MIT",
      redistributable: true as const,
      destination,
      healthArguments: ["--version"],
    };
    const options = {
      fetch: async () => {
        downloads++;
        return new Response(bytes);
      },
    };
    try {
      const first = await installPinnedExecutable(artifact, options);
      expect(first.health).toBe("integration-fixture");
      expect(first.reused).toBe(false);
      expect(first.sha256).toBe(artifact.sha256);
      expect(await readFile(destination)).toEqual(bytes);
      expect((await installPinnedExecutable(artifact, options)).reused).toBe(
        true,
      );
      expect(downloads).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("rejects corrupt download without executing it", async () => {
    await expect(
      installPinnedExecutable(
        {
          url: "https://official.example/tool",
          officialHosts: ["official.example"],
          sha256: "0".repeat(64),
          license: "MIT",
          redistributable: true,
          destination: join(tmpdir(), "rea-missing-corrupt-fixture"),
          healthArguments: [],
        },
        { fetch: async () => new Response("corrupt") },
      ),
    ).rejects.toThrow("SHA-256 mismatch");
  });
});

const doctorFixture = async () => ({
  healthy: true,
  environment_healthy: true,
  scope: {
    mode: "audit-wide" as const,
    clients: [],
    providers: [],
    skill: false,
    target: null,
  },
  scope_checks: [],
  informational_checks: [],
  checks: [],
});
describe("Python module discovery contract", () => {
  it.skipIf(process.env.REA_AUTONOMY_LIVE_PYTHON !== "1")(
    "probes the actual selected host's installed Python modules",
    async () => {
      const report = await discoverTools({ tools: [] });
      expect(report.pythonTools).toHaveLength(7);
      expect(
        report.pythonTools?.filter((item) => item.state === "healthy").length,
      ).toBeGreaterThan(0);
      await writeFile(
        "output/autonomy/python-discovery-live.json",
        JSON.stringify(report, null, 2),
      );
    },
    60_000,
  );
  it("uses an explicit interpreter, reports module health separately, and does not persist environment", async () => {
    const calls: string[] = [];
    const report = await discoverTools({
      tools: [],
      doctor: doctorFixture,
      environment: {
        REA_AUTONOMY_PYTHON: "/chosen/python",
        SECRET_FIXTURE: "not-report-data",
      },
      run: async (command, args, options) => {
        calls.push(command);
        expect(options?.timeout).toBe(15_000);
        expect(options?.maxBuffer).toBe(64 * 1024);
        expect(args[0]).toBe("-c");
        return {
          stdout: JSON.stringify({
            state: "healthy",
            version: "fixture-version",
          }),
          stderr: "",
        };
      },
    });
    expect(calls).toEqual(Array(7).fill("/chosen/python"));
    expect(report.tools).toEqual([]);
    expect(report.pythonTools).toHaveLength(7);
    expect(
      report.pythonTools?.find((item) => item.id === "frida-python"),
    ).toMatchObject({
      state: "healthy",
      interpreter: "/chosen/python",
      healthScope: expect.stringContaining("runtime hooks unverified"),
    });
    expect(JSON.stringify(report)).not.toContain("not-report-data");
  });
  it("falls back for a missing workspace module, preserves unhealthy imports, and rejects malformed responses", async () => {
    const report = await discoverTools({
      tools: [],
      doctor: doctorFixture,
      environment: {},
      platform: "darwin",
      run: async (command, args) => {
        if (args[2] === "frida") return { stdout: "not-json", stderr: "" };
        if (args[2] === "angr")
          return {
            stdout: JSON.stringify({
              state: "unhealthy",
              reason: "native dependency failed",
            }),
            stderr: "",
          };
        if (command !== "python3")
          return {
            stdout: JSON.stringify({
              state: "missing",
              reason: "module missing",
            }),
            stderr: "",
          };
        return {
          stdout: JSON.stringify({
            state: "healthy",
            version: "system-fixture",
          }),
          stderr: "",
        };
      },
    });
    expect(
      report.pythonTools?.find((item) => item.module === "capstone"),
    ).toMatchObject({ state: "healthy", interpreter: "python3" });
    expect(
      report.pythonTools?.find((item) => item.module === "angr"),
    ).toMatchObject({ state: "unhealthy", reason: "native dependency failed" });
    expect(
      report.pythonTools?.find((item) => item.module === "keystone"),
    ).toMatchObject({ state: "healthy", interpreter: "python3" });
    expect(
      report.pythonTools?.find((item) => item.module === "frida"),
    ).toMatchObject({
      state: "unhealthy",
      reason: expect.stringContaining("malformed"),
    });
  });
  it("can omit additional Python probes for existing discovery consumers", async () => {
    const report = await discoverTools({
      tools: [],
      doctor: doctorFixture,
      pythonTools: false,
      run: async () => {
        throw new Error("Unexpected process invocation");
      },
    });
    expect(report.pythonTools).toBeUndefined();
  });
});
