/** Binary-only REA MCP investigation. No target source or PDB is loaded. */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(
  "benchmarks/native-batch-2/originals/fd/extracted/fd-v10.5.0-x86_64-pc-windows-msvc/fd.exe",
);
const output = resolve("benchmarks/native-batch-2/analysis/fd");
const client = new Client({
  name: "rea-fd-native-investigation",
  version: "1",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("scripts/rea.mjs"), "mcp"],
  env: {
    PATH: process.env.PATH,
    GHIDRA_INSTALL_DIR: process.env.GHIDRA_INSTALL_DIR,
    JAVA_HOME: process.env.JAVA_HOME,
    REA_GHIDRA_STARTUP_TIMEOUT_MS: "600000",
    REA_GHIDRA_DISABLED_ANALYZERS:
      "Decompiler Switch Analysis,Decompiler Parameter ID",
    REA_LOG_LEVEL: "silent",
  },
  stderr: "pipe",
});
async function call(name, args, label) {
  const result = await client.callTool(
    { name, arguments: args },
    { timeout: 650000 },
  );
  const value = result.structuredContent ?? result;
  await writeFile(
    `${output}/${label}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
  if (result.isError)
    throw new Error(`${label}: ${JSON.stringify(value).slice(0, 600)}`);
  return value;
}
try {
  await client.connect(transport);
  await call("open_binary", { path: target, provider_id: "ghidra" }, "open");
  await call("binary_overview", {}, "overview-retry");
  await call("list_procedures", {}, "procedures");
  await call(
    "search_strings",
    {
      pattern: "hidden|gitignore|max-depth|regex|extension",
      mode: "regex",
      case_sensitive: false,
    },
    "relevant-strings",
  );
  await call("analyze_function", { procedure: "entry" }, "entry-dossier");
  for (const query of ["gitignore", "regex", "hidden"])
    await call("trace_feature", { query }, `feature-${query}`);
  await call("close_binary", {}, "close");
} catch (cause) {
  await writeFile(
    `${output}/investigation-failure.json`,
    JSON.stringify({ status: "UNVERIFIED", message: cause.message }, null, 2) +
      "\n",
  );
  process.exitCode = 1;
} finally {
  await client.close();
}
