import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const repo = resolve(root, "../..");
const name = process.argv[2];
const manifest = JSON.parse(
  await readFile(
    resolve(root, "manifests", `${name}-acquisition.json`),
    "utf8",
  ),
);
if (manifest.status !== "PASS") throw new Error("Acquisition has not passed");
const binary =
  manifest.executables.find((e) => !/crash|uninstall/i.test(e.path)) ??
  manifest.executables[0];
const out = resolve(root, "analysis", name);
await mkdir(out, { recursive: true });
const started = performance.now();
const client = new Client({ name: "rea-engine-native-batch-2", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(repo, "scripts/rea.mjs"), "mcp"],
  env: {
    PATH: process.env.PATH,
    GHIDRA_INSTALL_DIR: process.env.GHIDRA_INSTALL_DIR,
    JAVA_HOME: process.env.JAVA_HOME,
    REA_LOG_LEVEL: "silent",
    REA_MCP_MAX_RESPONSE_BYTES: "67108864",
    REA_GHIDRA_STARTUP_TIMEOUT_MS: "600000",
  },
  stderr: "pipe",
});
const evidence = [];
const summary = {
  target: name,
  binary: binary.path,
  sha256: binary.sha256,
  provider: "ghidra",
  status: "UNVERIFIED",
  functionsInvestigated: 0,
  failures: [],
  evidence: [],
  startedUtc: new Date().toISOString(),
};
async function call(operation, parameters, filename) {
  const answer = await client.callTool(
    { name: operation, arguments: parameters },
    { timeout: 600000 },
  );
  const value = answer.structuredContent ?? answer;
  await writeFile(
    resolve(out, filename + ".json"),
    JSON.stringify(value, null, 2) + "\n",
  );
  if (answer.isError) throw new Error(JSON.stringify(value).slice(0, 4000));
  if (value.evidence_id) {
    evidence.push(value);
    summary.evidence.push({
      id: value.evidence_id,
      file: filename + ".json",
      operation,
    });
  }
  return value;
}
try {
  await client.connect(transport);
  await call(
    "open_binary",
    { path: resolve(root, binary.path), provider_id: "ghidra" },
    "open",
  );
  const overview = await call("binary_overview", {}, "overview");
  summary.overview = overview.normalized_result;
  const inventory = await call("list_procedures", {}, "procedures");
  await call("list_strings", {}, "strings");
  const functions = inventory.normalized_result ?? [];
  const address =
    "0x" + (BigInt(binary.image_base) + BigInt(binary.entry_rva)).toString(16);
  const selected = functions.filter(
    (f) =>
      !f.procedure?.external &&
      !f.procedure?.thunk &&
      (f.address === address ||
        /main|Controller|search|walk|particle|update|render|gravity|collision/i.test(
          f.value,
        )),
  );
  if (!selected.some((f) => f.address === address))
    selected.unshift({ address });
  for (const entry of selected.slice(0, 8)) {
    try {
      await call(
        "analyze_function",
        { procedure: entry.address },
        "function-" + entry.address,
      );
      summary.functionsInvestigated++;
    } catch (error) {
      summary.failures.push({
        operation: "analyze_function",
        address: entry.address,
        error: String(error),
      });
    }
  }
  const queries =
    {
      bat: ["paging", "line numbers"],
      ripgrep: ["regex parse error", "line-number"],
      fd: ["hidden", "max-depth"],
    }[name] ?? [];
  for (let i = 0; i < queries.length; i++) {
    try {
      await call("trace_feature", { query: queries[i] }, "trace-" + i);
    } catch (error) {
      summary.failures.push({
        operation: "trace_feature",
        query: queries[i],
        error: String(error),
      });
    }
  }
  summary.status = "PARTIAL";
} catch (error) {
  summary.failures.push({ error: String(error) });
} finally {
  try {
    await call("close_binary", {}, "close");
  } catch (error) {
    summary.failures.push({ operation: "close_binary", error: String(error) });
  }
  await client.close();
  summary.analysisSeconds = (performance.now() - started) / 1000;
  summary.completedUtc = new Date().toISOString();
  await writeFile(
    resolve(out, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary));
}
