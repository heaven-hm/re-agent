import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  installManagedTool,
  readBoundedResponse,
} from "./install-managed-analysis-tool.mjs";

const roots = [];
const packageBytes = Buffer.from("test-only nupkg bytes");
const sha256 = createHash("sha256").update(packageBytes).digest("hex");
const version = "9.1.0.7988";

async function fixture({ packagePresent = false, source } = {}) {
  const root = await mkdtemp(join(tmpdir(), "rea-managed-install-test-"));
  roots.push(root);
  const sourceDir = join(root, "third_party/ilspy");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    join(sourceDir, "manifest.json"),
    JSON.stringify({
      tool: "ilspycmd",
      version,
      package: "ilspycmd.nupkg",
      sha256,
      source:
        source ??
        "https://api.nuget.org/v3-flatcontainer/ilspycmd/9.1.0.7988/ilspycmd.9.1.0.7988.nupkg",
    }),
  );
  if (packagePresent)
    await writeFile(join(sourceDir, "ilspycmd.nupkg"), packageBytes);
  return root;
}

test.afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("reuses healthy installation before trying network or reading a package", async () => {
  const root = await fixture();
  const directory = join(root, "tools");
  await mkdir(directory);
  await writeFile(join(directory, "ilspycmd"), "test executable");
  let fetchCalls = 0;
  let installCalls = 0;
  const result = await installManagedTool(
    ["node", "install", directory],
    {},
    {
      root,
      fetch: async () => {
        fetchCalls += 1;
        throw Error("unexpected network");
      },
      exec: async (command) => {
        if (command === "dotnet") installCalls += 1;
        return { stdout: `ilspycmd ${version}\n` };
      },
    },
  );
  assert.equal(result.reused, true);
  assert.equal(fetchCalls, 0);
  assert.equal(installCalls, 0);
});

test("downloads only the pinned NuGet URL into a temporary private feed and cleans it", async () => {
  const root = await fixture();
  const tempRoot = join(root, "tmp");
  await mkdir(tempRoot);
  let fetchedUrl;
  let temporaryFeed;
  const result = await installManagedTool(
    ["node", "install", join(root, "tools")],
    {},
    {
      root,
      tempRoot,
      fetch: async (url, options) => {
        fetchedUrl = String(url);
        assert.equal(options.redirect, "error");
        return new Response(packageBytes, { status: 200 });
      },
      exec: async (command, args) => {
        if (command === "dotnet") {
          const configPath = args[args.indexOf("--configfile") + 1];
          const config = await readFile(configPath, "utf8");
          temporaryFeed = config.match(/value="([^"]+)"/u)?.[1];
          assert.ok(temporaryFeed.startsWith(tempRoot));
          assert.deepEqual(
            await readFile(join(temporaryFeed, "ilspycmd.nupkg")),
            packageBytes,
          );
        }
        return { stdout: `ilspycmd ${version}\n` };
      },
    },
  );
  assert.equal(result.reused, false);
  assert.equal(
    fetchedUrl,
    "https://api.nuget.org/v3-flatcontainer/ilspycmd/9.1.0.7988/ilspycmd.9.1.0.7988.nupkg",
  );
  await assert.rejects(access(temporaryFeed));
  await assert.rejects(access(join(root, "tools", "NuGet.")), {
    code: "ENOENT",
  });
});

test("uses and verifies the source-checkout package without fetching", async () => {
  const root = await fixture({ packagePresent: true });
  let fetchCalls = 0;
  let localFeed;
  let localConfigPath;
  const result = await installManagedTool(
    ["node", "install", join(root, "tools")],
    {},
    {
      root,
      fetch: async () => {
        fetchCalls += 1;
        throw Error("unexpected network");
      },
      exec: async (command, args) => {
        if (command === "dotnet") {
          localConfigPath = args[args.indexOf("--configfile") + 1];
          const config = await readFile(localConfigPath, "utf8");
          localFeed = config.match(/value="([^"]+)"/u)?.[1];
        }
        return { stdout: `ilspycmd ${version}\n` };
      },
    },
  );
  assert.equal(result.reused, false);
  assert.equal(fetchCalls, 0);
  assert.equal(localFeed, join(root, "third_party/ilspy"));
  await assert.rejects(access(localConfigPath));
});

test("rejects non-NuGet hosts and bad package hashes before invoking dotnet", async () => {
  const root = await fixture({ source: "https://example.org/tool.nupkg" });
  let installCalls = 0;
  await assert.rejects(
    installManagedTool(
      ["node", "install", join(root, "tools")],
      {},
      {
        root,
        fetch: async () => new Response(packageBytes),
        exec: async (command) => {
          if (command === "dotnet") installCalls += 1;
          return { stdout: `ilspycmd ${version}\n` };
        },
      },
    ),
    /https:\/\/api\.nuget\.org/u,
  );
  assert.equal(installCalls, 0);
  const hashRoot = await fixture();
  await assert.rejects(
    installManagedTool(
      ["node", "install", join(hashRoot, "tools")],
      {},
      {
        root: hashRoot,
        fetch: async () => new Response(Buffer.from("tampered nupkg")),
        exec: async (command) => {
          if (command === "dotnet") installCalls += 1;
          return { stdout: `ilspycmd ${version}\n` };
        },
      },
    ),
    /checksum mismatch/u,
  );
  assert.equal(installCalls, 0);
});

test("enforces response byte limits from both declared and streamed size", async () => {
  await assert.rejects(
    readBoundedResponse(
      {
        ok: true,
        headers: { get: () => "4" },
        body: null,
        arrayBuffer: async () => Buffer.from("oversized"),
      },
      3,
    ),
    /size limit/u,
  );
  await assert.rejects(
    readBoundedResponse(new Response(Buffer.from("four")), 3),
    /size limit/u,
  );
});

test("removes downloaded package and feed config even when installation fails", async () => {
  const root = await fixture();
  const tempRoot = join(root, "tmp");
  await mkdir(tempRoot);
  let temporaryFeed;
  await assert.rejects(
    installManagedTool(
      ["node", "install", join(root, "tools")],
      {},
      {
        root,
        tempRoot,
        fetch: async () => new Response(packageBytes),
        exec: async (command, args) => {
          if (command === "dotnet") {
            const config = await readFile(
              args[args.indexOf("--configfile") + 1],
              "utf8",
            );
            temporaryFeed = config.match(/value="([^"]+)"/u)?.[1];
            throw Error("simulated dotnet failure");
          }
          return { stdout: `ilspycmd ${version}\n` };
        },
      },
    ),
    /simulated dotnet failure/u,
  );
  await assert.rejects(access(temporaryFeed));
});
