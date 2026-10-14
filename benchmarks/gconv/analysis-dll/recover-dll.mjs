import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2];
const name = target.split("/").at(-1).replace(".dll", "");
const out = resolve("benchmarks/gconv/analysis-dll");
const client = new Client({ name: "gconv-dll-evidence", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("scripts/rea.mjs"), "mcp"],
  env: {
    PATH: process.env.PATH,
    GHIDRA_INSTALL_DIR: process.env.GHIDRA_INSTALL_DIR,
    JAVA_HOME: process.env.JAVA_HOME,
    REA_LOG_LEVEL: "silent",
  },
  stderr: "pipe",
});
async function call(tool, args, file) {
  const result = await client.callTool(
    { name: tool, arguments: args },
    { timeout: 600000 },
  );
  const value = result.structuredContent ?? result;
  await writeFile(
    `${out}/${name}-${file}.json`,
    JSON.stringify(value, null, 2) + "\n",
  );
  if (result.isError) throw new Error(JSON.stringify(value));
  return value;
}
try {
  await client.connect(transport);
  await call("open_binary", { path: target, provider_id: "ghidra" }, "open");
  const inventory = await call("list_procedures", {}, "procedures");
  await call("list_strings", {}, "strings");
  const procedures = inventory.normalized_result ?? [];
  const candidates = procedures.filter(
    (p) =>
      !p.procedure?.external &&
      !p.procedure?.thunk &&
      /^(gc|VqCalc)/.test(p.value),
  );
  for (const p of candidates)
    await call(
      "analyze_function",
      { procedure: p.address },
      `function-${p.address}`,
    );
  await call("close_binary", {}, "close");
} finally {
  await client.close();
}
