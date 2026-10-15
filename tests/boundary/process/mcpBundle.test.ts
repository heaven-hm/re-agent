import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect } from "vitest";

import { bundleMcpRuntime } from "../../../scripts/bundle-mcp-runtime.mjs";
import { workspaceCliTest } from "../../support/cli/workspaceCliFixture.js";

describe("MCP runtime bundle", () => {
  workspaceCliTest(
    "preserves module locations, lazy side effects, package resolution and worker entrypoints",
    async ({ processes, workspace }) => {
      await workspace.mkdir("dist/provider");
      await workspace.mkdir("dist/composition");
      await workspace.mkdir("bridge");
      await workspace.mkdir("node_modules/external-probe");
      const files = {
        "package.json": JSON.stringify({
          type: "module",
          imports: {
            "#javascript-analysis-worker":
              "./dist/composition/javascriptAnalysisWorkerProcess.js",
          },
        }),
        "bridge/resource.txt": "bridge resource\n",
        "node_modules/external-probe/package.json": JSON.stringify({
          name: "external-probe",
          main: "index.cjs",
        }),
        "node_modules/external-probe/index.cjs": 'module.exports = "external";',
        "dist/provider/probe λ.js": `
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
globalThis.effects ??= [];
globalThis.effects.push('provider');
export const facts = {
  url: import.meta.url,
  resource: readFileSync(new URL('../../bridge/resource.txt', import.meta.url), 'utf8'),
  external: createRequire(import.meta.url)('external-probe'),
  worker: import.meta.resolve('#javascript-analysis-worker')
};`,
        "dist/lazy.js": `
globalThis.effects.push('lazy');
export const lazyUrl = import.meta.url;`,
        "dist/composition/javascriptAnalysisWorkerProcess.js":
          'process.stdout.write("worker-entry");',
        "dist/main.js": `
import { facts } from './provider/probe λ.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
globalThis.effects.push('main');
export const run = async () => {
  const beforeLazy = [...globalThis.effects];
  const { lazyUrl } = await import('./lazy.js');
  return {
    ...facts, beforeLazy, afterLazy: globalThis.effects, lazyUrl,
    workerOutput: execFileSync(process.execPath, [fileURLToPath(facts.worker)], { encoding: 'utf8' })
  };
};`,
      };
      for (const [path, contents] of Object.entries(files))
        await workspace.write(path, contents);
      const invoke = async (entry: string) => {
        const moduleUrl = pathToFileURL(join(workspace.root, entry)).href;
        const result = await processes.run(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            `const { run } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(JSON.stringify(await run()));`,
          ],
          { cwd: workspace.root },
        );
        expect(result.exitCode).toBe(0);
        return JSON.parse(result.stdout) as unknown;
      };
      const original = await invoke("dist/main.js");
      await bundleMcpRuntime(workspace.root);
      const bundled = await invoke("dist/mcp/main.js");
      expect(bundled).toEqual(original);
      expect(bundled).toMatchObject({
        resource: "bridge resource\n",
        external: "external",
        beforeLazy: ["provider", "main"],
        afterLazy: ["provider", "main", "lazy"],
        workerOutput: "worker-entry",
      });
      for (const [path, contents] of Object.entries(files))
        expect(await readFile(join(workspace.root, path), "utf8")).toBe(
          contents,
        );
      expect(
        (await readdir(join(workspace.root, "dist/mcp"))).length,
      ).toBeGreaterThan(1);
    },
  );

  workspaceCliTest(
    "rejects module-relative resolution and unknown import metadata during the build",
    async ({ workspace }) => {
      await workspace.mkdir("dist");
      await workspace.write("package.json", '{"type":"module"}');
      for (const expression of [
        "import.meta.resolve('./worker.js')",
        "import.meta.env",
      ]) {
        await workspace.write(
          "dist/main.js",
          `export const value = ${expression};`,
        );
        await expect(bundleMcpRuntime(workspace.root)).rejects.toThrow(
          "Unsupported import.meta use in MCP bundle",
        );
      }
    },
  );
});
