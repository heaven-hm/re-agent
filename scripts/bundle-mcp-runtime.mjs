import { parse } from "@babel/parser";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Reduce filesystem resolution during MCP startup. Keep dependencies external,
 * dynamic imports lazy, and the original compiled files for CLI/worker entrypoints.
 */
export const bundleMcpRuntime = async (root) => {
  const compiledRoot = join(root, "dist");
  const { rolldown, RUNTIME_MODULE_ID } = await import("rolldown");
  const { imports = {} } = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const bundle = await rolldown({
    input: { main: join(compiledRoot, "main.js") },
    platform: "node",
    treeshake: false,
    external: (source) => !source.startsWith(".") && !isAbsolute(source),
    plugins: [
      {
        name: "preserve-compiled-module-locations",
        transform(code, id) {
          if (id === RUNTIME_MODULE_ID) return null;
          if (!code.includes("import.meta")) return null;
          const sourcePath = relative(compiledRoot, id);
          if (
            isAbsolute(sourcePath) ||
            sourcePath === ".." ||
            sourcePath.startsWith(`..${sep}`)
          )
            throw new Error(`MCP bundle input is outside dist: ${id}`);
          // All chunks are directly under dist/mcp. Preserve the original
          // module URL, including URL escaping, for bridges and createRequire.
          const moduleUrl = `new URL(${JSON.stringify(`../${sourcePath.split(sep).map(encodeURIComponent).join("/")}`)}, import.meta.url).href`;
          const edits = [];
          const visit = (node) => {
            if (node === null || typeof node !== "object") return;
            const isMeta = (value) =>
              value?.type === "MetaProperty" &&
              value.meta.name === "import" &&
              value.property.name === "meta";
            if (
              node.type === "CallExpression" &&
              node.callee.type === "MemberExpression" &&
              !node.callee.computed &&
              isMeta(node.callee.object) &&
              node.callee.property.name === "resolve" &&
              node.arguments.length === 1 &&
              node.arguments[0].type === "StringLiteral" &&
              Object.hasOwn(imports, node.arguments[0].value)
            )
              // Package imports resolve in the same package scope after bundling.
              return;
            if (
              node.type === "MemberExpression" &&
              !node.computed &&
              isMeta(node.object) &&
              node.property.name === "url"
            ) {
              edits.push({ start: node.start, end: node.end });
              return;
            }
            if (isMeta(node))
              throw new Error(
                `Unsupported import.meta use in MCP bundle: ${id}`,
              );
            for (const value of Object.values(node)) {
              if (Array.isArray(value)) value.forEach(visit);
              else visit(value);
            }
          };
          visit(parse(code, { sourceType: "module" }).program);
          for (const { start, end } of edits.sort((a, b) => b.start - a.start))
            code = code.slice(0, start) + moduleUrl + code.slice(end);
          return { code, map: null };
        },
      },
    ],
  });
  try {
    await bundle.write({
      dir: join(compiledRoot, "mcp"),
      format: "esm",
      entryFileNames: "[name].js",
      chunkFileNames: "[name]-[hash].js",
      codeSplitting: true,
      strictExecutionOrder: true,
      minify: false,
      sourcemap: false,
    });
  } finally {
    await bundle.close();
  }
};

if (
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await bundleMcpRuntime(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
