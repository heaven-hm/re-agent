import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";

/** Find an explicit or PATH-installed executable without launching it. */
export const resolveRadare2Executable = (
  environment: Readonly<NodeJS.ProcessEnv>,
): string | null => {
  const configured = environment.REA_RADARE2_PATH;
  if (configured !== undefined) {
    if (!isAbsolute(configured)) return null;
    return executablePath(configured);
  }
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const candidate = join(
      directory,
      process.platform === "win32" ? "r2.exe" : "r2",
    );
    const resolved = executablePath(candidate);
    if (resolved !== null) return resolved;
  }
  return null;
};

const executablePath = (path: string): string | null => {
  try {
    const canonical = realpathSync(path);
    accessSync(canonical, constants.X_OK);
    return statSync(canonical).isFile() ? canonical : null;
  } catch {
    return null;
  }
};
