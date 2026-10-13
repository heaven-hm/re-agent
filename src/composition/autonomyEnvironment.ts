import { constants } from "node:fs";
import { access, opendir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { execFileOutput } from "../process/ExecFileOutput.js";
import {
  ghidraApplicationProperties,
  ghidraJavaMajorAccepted,
  ghidraJavaRequirement,
  ghidraReleaseAccepted,
  type GhidraJavaRequirement,
} from "../ghidra/GhidraInstallationPolicy.js";

export interface AutonomyEnvironmentOptions {
  readonly platform?: NodeJS.Platform;
  readonly ghidraCandidates?: readonly string[];
  readonly javaCandidates?: readonly string[];
  readonly run?: typeof execFileOutput;
}
/** Bounded enumeration of installation directories only; never search repositories or configuration. */
const installedChildren = async (
  root: string,
  pattern: RegExp,
  suffix = "",
): Promise<string[]> => {
  const paths: string[] = [];
  try {
    const directory = await opendir(root);
    let examined = 0;
    for await (const entry of directory) {
      if (examined++ >= 128) break;
      if (
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        pattern.test(entry.name)
      )
        paths.push(join(root, entry.name, suffix));
    }
  } catch {
    /* Optional standard installation directory may be absent. */
  }
  return paths.sort();
};
const localCandidates = async (
  platform: NodeJS.Platform,
  environment: Readonly<NodeJS.ProcessEnv>,
): Promise<{ ghidra: string[]; java: string[] }> => {
  if (platform === "darwin")
    return {
      ghidra: [
        "/opt/homebrew/opt/ghidra/libexec",
        "/usr/local/opt/ghidra/libexec",
        "/Applications/ghidra",
        ...(await installedChildren("/Applications", /^ghidra(?:_|-|$)/iu)),
      ],
      java: [
        "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
        "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
        ...(await installedChildren(
          "/Library/Java/JavaVirtualMachines",
          /(?:jdk|temurin|corretto)/iu,
          "Contents/Home",
        )),
      ],
    };
  if (platform === "linux")
    return {
      ghidra: [
        "/opt/ghidra",
        "/usr/share/ghidra",
        ...(await installedChildren("/opt", /^ghidra(?:_|-|$)/iu)),
      ],
      java: [
        "/usr/lib/jvm/java-21-openjdk-amd64",
        "/usr/lib/jvm/java-21-openjdk-arm64",
        "/usr/lib/jvm/default-java",
        ...(await installedChildren("/usr/lib/jvm", /(?:jdk|java|temurin)/iu)),
      ],
    };
  if (platform === "win32") {
    const programFiles =
      environment.ProgramFiles ??
      environment.PROGRAMFILES ??
      "C:\\Program Files";
    return {
      ghidra: [
        join(programFiles, "Ghidra"),
        ...(await installedChildren(programFiles, /^ghidra(?:_|-|$)/iu)),
        ...(await installedChildren("C:\\tools", /^ghidra(?:_|-|$)/iu)),
      ],
      java: [
        ...(await installedChildren(join(programFiles, "Java"), /^jdk/iu)),
        ...(await installedChildren(
          join(programFiles, "Eclipse Adoptium"),
          /^jdk/iu,
        )),
        ...(await installedChildren(join(programFiles, "Microsoft"), /^jdk/iu)),
      ],
    };
  }
  return { ghidra: [], java: [] };
};
const installationProperties = async (
  path: string,
  platform: NodeJS.Platform,
) => {
  await access(
    join(
      path,
      "support",
      platform === "win32" ? "analyzeHeadless.bat" : "analyzeHeadless",
    ),
    platform === "win32" ? constants.F_OK : constants.X_OK,
  );
  const propertiesPath = join(path, "Ghidra", "application.properties");
  const metadata = await stat(propertiesPath);
  if (!metadata.isFile() || metadata.size > 64 * 1024)
    throw new Error("Unsupported Ghidra properties file");
  return ghidraApplicationProperties(await readFile(propertiesPath, "utf8"));
};
const configuredKey = (
  environment: Readonly<NodeJS.ProcessEnv>,
  key: string,
  platform: NodeJS.Platform,
): string | undefined => {
  if (platform !== "win32")
    return environment[key] === undefined ? undefined : key;
  return Object.keys(environment).find(
    (candidate) =>
      candidate.toUpperCase() === key && environment[candidate] !== undefined,
  );
};
const healthyJava = async (
  path: string,
  requirement: GhidraJavaRequirement,
  platform: NodeJS.Platform,
  options: { environment: NodeJS.ProcessEnv; run: typeof execFileOutput },
): Promise<boolean> => {
  try {
    const executable = join(
      path,
      "bin",
      platform === "win32" ? "java.exe" : "java",
    );
    await access(
      executable,
      platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    await access(
      join(path, "bin", platform === "win32" ? "javac.exe" : "javac"),
      platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    const version = await options.run(executable, ["-version"], {
      env: options.environment,
      timeout: 5000,
      maxBuffer: 16 * 1024,
      stopSignal: "SIGTERM",
    });
    const match = /(?:openjdk|java) version "(\d+)(?:\.(\d+))?/u.exec(
      `${version.stdout}\n${version.stderr}`,
    );
    const major = Number(match?.[1] === "1" ? match[2] : match?.[1]);
    return (
      Number.isSafeInteger(major) && ghidraJavaMajorAccepted(major, requirement)
    );
  } catch {
    return false;
  }
};

/** Discover compatible local installations without mutating configuration or persisting ambient secrets. */
export const resolveAutonomyEnvironment = async (
  selected: Readonly<NodeJS.ProcessEnv>,
  options: AutonomyEnvironmentOptions = {},
): Promise<Readonly<NodeJS.ProcessEnv>> => {
  const platform = options.platform ?? process.platform;
  const environment = { ...selected };
  const ghidraKey = configuredKey(selected, "GHIDRA_INSTALL_DIR", platform);
  const javaKey = configuredKey(selected, "JAVA_HOME", platform);
  if (ghidraKey !== undefined && javaKey !== undefined) return environment;
  const defaults =
    options.ghidraCandidates !== undefined &&
    options.javaCandidates !== undefined
      ? { ghidra: [], java: [] }
      : await localCandidates(platform, selected);
  let requirement = ghidraJavaRequirement(ghidraApplicationProperties(""));
  if (ghidraKey !== undefined) {
    try {
      requirement = ghidraJavaRequirement(
        await installationProperties(selected[ghidraKey]!, platform),
      );
    } catch {
      /* Preserve invalid caller choice for provider diagnostics. */
    }
  } else {
    for (const path of [
      ...new Set(options.ghidraCandidates ?? defaults.ghidra),
    ].slice(0, 32)) {
      try {
        const properties = await installationProperties(path, platform);
        const candidateRequirement = ghidraJavaRequirement(properties);
        if (
          !ghidraReleaseAccepted(properties.providerVersion) ||
          candidateRequirement.unresolved !== null
        )
          continue;
        environment.GHIDRA_INSTALL_DIR = path;
        requirement = candidateRequirement;
        break;
      } catch {
        /* Missing or incompatible installations remain unavailable. */
      }
    }
  }
  if (javaKey === undefined) {
    for (const path of [
      ...new Set(options.javaCandidates ?? defaults.java),
    ].slice(0, 32)) {
      if (
        await healthyJava(path, requirement, platform, {
          environment,
          run: options.run ?? execFileOutput,
        })
      ) {
        environment.JAVA_HOME = path;
        break;
      }
    }
  }
  return environment;
};
