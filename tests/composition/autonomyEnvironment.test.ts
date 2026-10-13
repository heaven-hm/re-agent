import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAutonomyEnvironment } from "../../src/composition/autonomyEnvironment.js";

const ghidra = async (
  root: string,
  version: string,
  bounds = "application.java.min=21\napplication.java.max=21\n",
) => {
  await mkdir(join(root, "Ghidra"), { recursive: true });
  await mkdir(join(root, "support"), { recursive: true });
  await writeFile(
    join(root, "Ghidra", "application.properties"),
    `application.version=${version}\n${bounds}`,
  );
  await writeFile(
    join(root, "support", "analyzeHeadless"),
    "#!/bin/sh\nexit 0\n",
    { mode: 0o700 },
  );
};
const java = async (root: string, version: string) => {
  await mkdir(join(root, "bin"), { recursive: true });
  await writeFile(
    join(root, "bin", "java"),
    `#!/bin/sh\necho 'openjdk version "${version}"' >&2\n`,
    { mode: 0o700 },
  );
  await writeFile(join(root, "bin", "javac"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });
};
describe("autonomous reuse of local Ghidra and JDK installations", () => {
  it("selects a supported release and healthy JDK within declared bounds without changing caller environment", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rea-discovery-"));
    try {
      const oldGhidra = join(directory, "old-ghidra");
      const compatible = join(directory, "ghidra");
      const oldJava = join(directory, "java17");
      const compatibleJava = join(directory, "java21");
      const tooNewJava = join(directory, "java25");
      await ghidra(oldGhidra, "11.4.1");
      await ghidra(compatible, "12.1.4");
      await java(oldJava, "17.0.1");
      await java(tooNewJava, "25.0.1");
      await java(compatibleJava, "21.0.11");
      const selected = Object.freeze({
        PATH: "/usr/bin",
        TEST_CALLER_VALUE: "preserved",
      });
      const result = await resolveAutonomyEnvironment(selected, {
        platform: "darwin",
        ghidraCandidates: [oldGhidra, compatible],
        javaCandidates: [oldJava, tooNewJava, compatibleJava],
      });
      expect(result.GHIDRA_INSTALL_DIR).toBe(compatible);
      expect(result.JAVA_HOME).toBe(compatibleJava);
      expect(result.TEST_CALLER_VALUE).toBe("preserved");
      expect(selected).toEqual({
        PATH: "/usr/bin",
        TEST_CALLER_VALUE: "preserved",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("preserves explicit invalid and empty values without probing or overriding", async () => {
    const selected = {
      GHIDRA_INSTALL_DIR: "/explicit/missing",
      JAVA_HOME: "",
      PATH: "/usr/bin",
    };
    let probed = false;
    const result = await resolveAutonomyEnvironment(selected, {
      ghidraCandidates: ["/other"],
      javaCandidates: ["/other"],
      run: async () => {
        probed = true;
        throw new Error("Unexpected execution");
      },
    });
    expect(result).toEqual(selected);
    expect(probed).toBe(false);
    expect(
      await resolveAutonomyEnvironment(
        { java_home: "bad", ghidra_install_dir: "bad" },
        { platform: "win32" },
      ),
    ).toEqual({ java_home: "bad", ghidra_install_dir: "bad" });
  });
  it("rejects malformed release metadata, missing launchers and JRE-only installations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rea-discovery-"));
    try {
      const invalid = join(directory, "bad");
      const incompatible = join(directory, "bad-bounds");
      const jre = join(directory, "jre");
      await ghidra(invalid, "garbage");
      await ghidra(incompatible, "12.1.2", "application.java.min=garbage\n");
      await java(jre, "21.0.1");
      await rm(join(jre, "bin", "javac"));
      expect(
        await resolveAutonomyEnvironment(
          {},
          {
            platform: "linux",
            ghidraCandidates: [invalid, incompatible],
            javaCandidates: [jre],
          },
        ),
      ).toEqual({});
      await chmod(join(invalid, "support", "analyzeHeadless"), 0o600);
      await writeFile(
        join(invalid, "Ghidra", "application.properties"),
        "application.version=12.1.4\n",
      );
      expect(
        await resolveAutonomyEnvironment(
          {},
          {
            platform: "linux",
            ghidraCandidates: [invalid],
            javaCandidates: [],
          },
        ),
      ).toEqual({});
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
