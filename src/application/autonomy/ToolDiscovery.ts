import { z } from "zod";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { delimiter, dirname, join, resolve } from "node:path";
import { execFileOutput } from "../../process/ExecFileOutput.js";
import { runDoctor, systemDoctorHost, type DoctorReport } from "../Doctor.js";

export interface ToolProbe {
  readonly id: string;
  readonly executable: string;
  readonly versionArguments: readonly string[];
  readonly capabilities: readonly string[];
  readonly proprietary?: boolean;
}
export interface ToolStatus extends ToolProbe {
  readonly state: "healthy" | "missing" | "unhealthy";
  readonly path?: string;
  readonly version?: string;
  readonly reason?: string;
}
export const autonomyTools: readonly ToolProbe[] = [
  {
    id: "clang",
    executable: "clang",
    versionArguments: ["--version"],
    capabilities: ["compile-c", "compile-cpp"],
  },
  {
    id: "lldb",
    executable: "lldb",
    versionArguments: ["--version"],
    capabilities: ["runtime-debugging"],
  },
  {
    id: "gdb",
    executable: "gdb",
    versionArguments: ["--version"],
    capabilities: ["runtime-debugging"],
  },
  {
    id: "radare2",
    executable: "r2",
    versionArguments: ["-v"],
    capabilities: ["static-analysis", "function-discovery"],
  },
  {
    id: "rizin",
    executable: "rizin",
    versionArguments: ["-v"],
    capabilities: ["static-analysis"],
  },
  {
    id: "frida",
    executable: "frida",
    versionArguments: ["--version"],
    capabilities: ["runtime-instrumentation"],
  },
  {
    id: "rust",
    executable: "rustc",
    versionArguments: ["--version"],
    capabilities: ["compile-rust"],
  },
  {
    id: "dotnet",
    executable: "dotnet",
    versionArguments: ["--version"],
    capabilities: ["compile-csharp"],
  },
  {
    id: "ffmpeg",
    executable: "ffmpeg",
    versionArguments: ["-version"],
    capabilities: ["audio-video-comparison", "game-frame-quality-metrics"],
  },
  {
    id: "apitrace",
    executable: "apitrace",
    versionArguments: ["--version"],
    capabilities: ["graphics-api-tracing", "graphics-trace-replay"],
  },
  {
    id: "renderdoc",
    executable: "renderdoccmd",
    versionArguments: ["--version"],
    capabilities: ["frame-capture"],
  },
  {
    id: "z3",
    executable: "z3",
    versionArguments: ["-version"],
    capabilities: ["smt"],
  },
  {
    id: "brew",
    executable: "brew",
    versionArguments: ["--version"],
    capabilities: ["package-manager"],
  },
  {
    id: "apt",
    executable: "apt",
    versionArguments: ["--version"],
    capabilities: ["package-manager"],
  },
  {
    id: "winget",
    executable: "winget",
    versionArguments: ["--version"],
    capabilities: ["package-manager"],
  },
];
export interface PythonToolStatus {
  readonly id: string;
  readonly module: string;
  readonly distribution: string;
  readonly state: "healthy" | "missing" | "unhealthy";
  readonly interpreter: string;
  readonly version?: string;
  readonly reason?: string;
  readonly healthScope: string;
}
const pythonToolProbes = [
  {
    id: "frida-python",
    module: "frida",
    distribution: "frida",
    healthScope:
      "Import, version and local device query; runtime hooks unverified",
  },
  {
    id: "capstone-python",
    module: "capstone",
    distribution: "capstone",
    healthScope:
      "Disassembly of one ARM64 instruction; target analysis unverified",
  },
  {
    id: "keystone-python",
    module: "keystone",
    distribution: "keystone-engine",
    healthScope:
      "Assembly of one ARM64 instruction; target patching unverified",
  },
  {
    id: "lief-python",
    module: "lief",
    distribution: "lief",
    healthScope:
      "Import, version and parser API availability; target parsing unverified",
  },
  {
    id: "z3-python",
    module: "z3",
    distribution: "z3-solver",
    healthScope:
      "Solve a satisfiable integer constraint; equivalence unverified",
  },
  {
    id: "angr-python",
    module: "angr",
    distribution: "angr",
    healthScope:
      "Import, version and project API availability; target symbolic execution unverified",
  },
  {
    id: "pillow-python",
    module: "PIL",
    distribution: "Pillow",
    healthScope:
      "PNG encode/decode pixel comparison; application image fidelity unverified",
  },
] as const;
const pythonHealthProgram = String.raw`
import sys,json,importlib,importlib.metadata
name,distribution=sys.argv[1:3]
try:
 module=importlib.import_module(name); version=importlib.metadata.version(distribution)
 if name=='frida': assert module.get_local_device().type=='local'
 elif name=='capstone': assert len(list(module.Cs(module.CS_ARCH_ARM64,module.CS_MODE_ARM).disasm(bytes.fromhex('1f2003d5'),0)))==1
 elif name=='keystone': assert bytes(module.Ks(module.KS_ARCH_ARM64,module.KS_MODE_LITTLE_ENDIAN).asm('nop')[0])==bytes.fromhex('1f2003d5')
 elif name=='lief': assert callable(module.parse)
 elif name=='z3':
  x=module.Int('rea_health_x'); solver=module.Solver(); solver.add(x>4,x<6); assert solver.check()==module.sat and solver.model()[x].as_long()==5
 elif name=='angr': assert callable(module.Project)
 elif name=='PIL':
  from PIL import Image,ImageChops
  import io
  image=Image.new('RGBA',(2,2),(1,2,3,255)); stream=io.BytesIO(); image.save(stream,format='PNG'); stream.seek(0); assert ImageChops.difference(image,Image.open(stream)).getbbox() is None
 print(json.dumps({'state':'healthy','version':version}))
except ModuleNotFoundError as error:
 print(json.dumps({'state':'missing' if error.name==name else 'unhealthy','reason':str(error)}))
except Exception as error:
 print(json.dumps({'state':'unhealthy','reason':str(error)}))
`;
const pythonProbeOutput = z.discriminatedUnion("state", [
  z
    .object({ state: z.literal("healthy"), version: z.string().min(1) })
    .strict(),
  z
    .object({ state: z.enum(["missing", "unhealthy"]), reason: z.string() })
    .strict(),
]);
const discoverPythonTools = async (
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  run: typeof execFileOutput,
): Promise<readonly PythonToolStatus[]> => {
  const selected = environment.REA_AUTONOMY_PYTHON;
  const interpreters =
    selected !== undefined
      ? [selected]
      : [
          resolve(
            "output/autonomy/tools-python/venv",
            platform === "win32" ? "Scripts/python.exe" : "bin/python",
          ),
          "python3",
        ];
  return Promise.all(
    pythonToolProbes.map(async (tool): Promise<PythonToolStatus> => {
      let last: PythonToolStatus | undefined;
      for (const interpreter of interpreters) {
        try {
          const output = await run(
            interpreter,
            ["-c", pythonHealthProgram, tool.module, tool.distribution],
            {
              timeout: 15_000,
              maxBuffer: 64 * 1024,
              env: environment,
              stopSignal: "SIGTERM",
            },
          );
          const parsed = pythonProbeOutput.safeParse(JSON.parse(output.stdout));
          if (!parsed.success)
            throw new Error("Invalid Python health probe response");
          const status = { ...tool, interpreter, ...parsed.data };
          if (status.state === "healthy") return status;
          if (status.state === "unhealthy") return status;
          last = status;
        } catch {
          last = {
            ...tool,
            interpreter,
            state: "unhealthy",
            reason:
              "Python interpreter health probe failed, timed out or returned malformed output",
          };
        }
      }
      return (
        last ?? {
          ...tool,
          interpreter: "",
          state: "missing",
          reason: "No selected Python interpreter",
        }
      );
    }),
  );
};
export interface ToolDiscoveryReport {
  readonly platform: NodeJS.Platform;
  readonly architecture: NodeJS.Architecture;
  readonly tools: readonly ToolStatus[];
  readonly doctor: DoctorReport;
  readonly pythonTools?: readonly PythonToolStatus[];
  readonly installationPolicy: string;
}
const findToolPath = async (
  executable: string,
  platform: NodeJS.Platform,
  paths: readonly string[],
): Promise<string | undefined> => {
  const names =
    platform === "win32"
      ? [executable, `${executable}.exe`, `${executable}.cmd`]
      : [executable];
  let path: string | undefined;
  for (const directory of paths) {
    if (!directory) continue;
    for (const name of names) {
      const candidate = join(directory, name);
      try {
        await access(
          candidate,
          platform === "win32" ? constants.F_OK : constants.X_OK,
        );
        path = candidate;
        break;
      } catch {
        /* Probe next installed path. */
      }
    }
    if (path) break;
  }
  return path;
};
export const discoverTools = async (
  options: {
    readonly tools?: readonly ToolProbe[];
    readonly environment?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly architecture?: NodeJS.Architecture;
    readonly run?: typeof execFileOutput;
    readonly doctor?: () => Promise<DoctorReport>;
    readonly pythonTools?: boolean;
  } = {},
): Promise<ToolDiscoveryReport> => {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const paths = (environment.PATH ?? "").split(
    platform === "win32" ? ";" : delimiter,
  );
  const tools = await Promise.all(
    (options.tools ?? autonomyTools).map(async (tool): Promise<ToolStatus> => {
      const path = await findToolPath(tool.executable, platform, paths);
      if (!path)
        return {
          ...tool,
          state: "missing",
          reason: tool.proprietary
            ? "Bring your own licensed installation"
            : "Not found on PATH; no unpinned download attempted",
        };
      try {
        const output = await (options.run ?? execFileOutput)(
          path,
          tool.versionArguments,
          {
            timeout: 10_000,
            maxBuffer: 64 * 1024,
            env: environment,
            stopSignal: "SIGTERM",
          },
        );
        const version = `${output.stdout}\n${output.stderr}`.trim();
        return version
          ? { ...tool, state: "healthy", path, version }
          : {
              ...tool,
              state: "unhealthy",
              path,
              reason: "Version probe returned no output",
            };
      } catch {
        return {
          ...tool,
          state: "unhealthy",
          path,
          reason: "Version health probe failed or timed out",
        };
      }
    }),
  );
  return {
    platform,
    architecture: options.architecture ?? process.arch,
    tools,
    ...(options.pythonTools === false
      ? {}
      : {
          pythonTools: await discoverPythonTools(
            environment,
            platform,
            options.run ?? execFileOutput,
          ),
        }),
    doctor: await (
      options.doctor ??
      (() =>
        runDoctor(
          undefined,
          systemDoctorHost({
            environment,
            platform,
            architecture: options.architecture ?? process.arch,
          }),
        ))
    )(),
    installationPolicy:
      "Reuse installed tools. REA setup does not install Java, Ghidra, package managers, or proprietary tools. Separate redistributable executable installation requires an explicit official HTTPS URL, pinned SHA-256, license, and integration health probe.",
  };
};

export interface PinnedExecutableArtifact {
  readonly url: string;
  readonly officialHosts: readonly string[];
  readonly sha256: string;
  readonly license: string;
  readonly redistributable: true;
  readonly destination: string;
  readonly healthArguments: readonly string[];
}
const validateArtifact = (artifact: PinnedExecutableArtifact): URL => {
  const url = new URL(artifact.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !artifact.officialHosts.includes(url.hostname)
  )
    throw new Error(
      "Artifact must use an explicitly trusted official HTTPS host",
    );
  if (
    !/^[a-f0-9]{64}$/u.test(artifact.sha256) ||
    !artifact.license.trim() ||
    artifact.redistributable !== true
  )
    throw new Error("Pinned SHA-256 and redistribution license required");
  return url;
};
/** Install a caller-selected standalone executable; never run package scripts or archive extractors. */
export const installPinnedExecutable = async (
  artifact: PinnedExecutableArtifact,
  options: {
    readonly fetch?: typeof fetch;
    readonly run?: typeof execFileOutput;
  } = {},
): Promise<{
  readonly path: string;
  readonly sha256: string;
  readonly health: string;
  readonly reused: boolean;
}> => {
  const url = validateArtifact(artifact);
  const path = resolve(artifact.destination);
  const health = async (executable: string): Promise<string> => {
    const output = await (options.run ?? execFileOutput)(
      executable,
      artifact.healthArguments,
      { timeout: 10_000, maxBuffer: 64 * 1024, stopSignal: "SIGTERM" },
    );
    const text = `${output.stdout}\n${output.stderr}`.trim();
    if (!text) throw new Error("Installed artifact failed health probe");
    return text;
  };
  try {
    await access(path, constants.X_OK);
    return {
      path,
      sha256: createHash("sha256")
        .update(await readFile(path))
        .digest("hex"),
      health: await health(path),
      reused: true,
    };
  } catch {
    /* Missing or unhealthy executable needs a verified artifact. */
  }
  const response = await (options.fetch ?? fetch)(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`Artifact download HTTP ${String(response.status)}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Artifact download has no body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 64 * 1024 * 1024)
        throw new Error("Standalone artifact exceeds 64 MiB");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error("Artifact SHA-256 mismatch");
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.pending`;
  const backup = `${path}.${randomUUID()}.backup`;
  let backedUp = false;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o700 });
    const output = await health(temporary);
    try {
      await rename(path, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(temporary, path);
    return { path, sha256: artifact.sha256, health: output, reused: false };
  } catch (error) {
    if (backedUp) await rename(backup, path);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
};
