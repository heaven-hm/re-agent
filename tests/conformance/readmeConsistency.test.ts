import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const translatedReadmes = [
  "README_zh.md",
  "README_zh-TW.md",
  "README_ja.md",
  "README_ko.md",
  "README_tr.md",
  "README_ru.md",
  "README_vi.md",
  "README_th.md",
  "README_de.md",
  "README_es.md",
  "README_fr.md",
  "README_uk.md",
  "README_pl.md",
  "README_pt-BR.md",
  "README_ar.md",
  "README_fa.md",
  "README_id.md",
] as const;

const jsonExamples = (content: string): unknown[] =>
  [...content.matchAll(/```json\s*([\s\S]*?)```/gu)].map((match): unknown =>
    JSON.parse(match[1] ?? ""),
  );

const shellExamples = (content: string): string[] =>
  [...content.matchAll(/```bash\s*([\s\S]*?)```/gu)].map((match) =>
    (match[1] ?? "").trim(),
  );

describe("onboarding documentation product facts", () => {
  it("labels the public upstream MCP example separately from this repository", async () => {
    const content = await readFile(resolve("docs/installation.md"), "utf8");
    expect(content).toContain("This checkout builds the `rea-engine` package");
    expect(content).toContain("is not installed by that package");
    expect(
      jsonExamples(content).some((example) => {
        if (typeof example !== "object" || example === null) return false;
        const servers = Reflect.get(example, "mcpServers");
        if (typeof servers !== "object" || servers === null) return false;
        const server = Reflect.get(servers, "rea");
        if (typeof server !== "object" || server === null) return false;
        return (
          Reflect.get(server, "command") === "npx" &&
          JSON.stringify(Reflect.get(server, "args")) ===
            JSON.stringify(["-y", "rea-agents@6.4.0", "mcp"])
        );
      }),
    ).toBe(true);
  });

  it("keeps translated onboarding commands aligned across locales", async () => {
    const baseline = shellExamples(
      await readFile(resolve(translatedReadmes[0]), "utf8"),
    );
    expect(baseline.length).toBeGreaterThan(0);
    for (const path of translatedReadmes.slice(1))
      expect(
        shellExamples(await readFile(resolve(path), "utf8")),
        path,
      ).toEqual(baseline);
  });
});
