import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8")) as unknown;

describe("Ghidra distribution version scope", () => {
  it("keeps the optional archive distinct from the verified bridge runtime", async () => {
    const manifest = (await readJson("third_party/ghidra/manifest.json")) as {
      version: string;
      file: string;
      versionScope: string;
      bridgeVerification: {
        verifiedVersion: string;
        acceptedReleaseLine: string;
      };
    };
    const inventory = (await readJson(
      "third_party/ghidra/license-inventory.json",
    )) as string[];
    const readme = await readFile("third_party/ghidra/README.md", "utf8");
    const notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8");
    const installation = await readFile("docs/installation.md", "utf8");

    expect(manifest).toMatchObject({
      version: "12.1.2",
      file: "ghidra_12.1.2_PUBLIC_20260605.zip",
      versionScope:
        "optional distributed archive; not the bridge verification runtime",
      bridgeVerification: {
        verifiedVersion: "12.1.4",
        acceptedReleaseLine: "12.1.x",
      },
    });
    expect(inventory.length).toBeGreaterThan(0);
    expect(
      inventory.every((path) => path.startsWith("ghidra_12.1.2_PUBLIC/")),
    ).toBe(true);
    expect(readme).toContain(
      "They are not the license files for the 12.1.2 archive",
    );
    expect(notices).toContain(
      "REA's bridge verification baseline is Ghidra 12.1.4",
    );
    expect(notices).toContain(
      "the optional preview release asset is the unchanged official 12.1.2 archive",
    );
    expect(installation).toContain("The bridge is verified with Ghidra 12.1.4");
  });
});
