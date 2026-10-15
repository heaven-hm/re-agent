import { describe, expect, it } from "vitest";
import { parseConfig } from "../config/parseConfig.js";
import { BinaryNinjaProvider } from "./BinaryNinjaProvider.js";
import { BINARYNINJA_PROVIDER_IDENTITY } from "./BinaryNinjaProviderCapabilities.js";

describe("Binary Ninja provider candidate", () => {
  it("reports identity and capabilities", () => {
    const config = parseConfig({});
    if (!config.ok) throw new Error("expected valid configuration");
    const provider = new BinaryNinjaProvider(config.value, {});
    expect(provider.identity()).toEqual(BINARYNINJA_PROVIDER_IDENTITY);
    expect(provider.capabilities().length).toBeGreaterThan(0);
  });

  it("reports unavailable when not configured", () => {
    const config = parseConfig({});
    if (!config.ok) throw new Error("expected valid configuration");
    const provider = new BinaryNinjaProvider(config.value, {});
    expect(provider.inspectAvailability()).toMatchObject({
      status: "unavailable",
      code: "not_configured",
    });
  });

  it("inspects target support accurately", () => {
    const config = parseConfig({});
    if (!config.ok) throw new Error("expected valid configuration");
    const provider = new BinaryNinjaProvider(config.value, {});

    expect(
      provider.inspectTargetSupport({
        path: "/tmp/sample.bndb",
        sha256: "a".repeat(64),
        kind: "database",
        format: "analysis-database",
      }),
    ).toMatchObject({
      status: "unsupported",
      code: "target_kind_unsupported",
    });

    expect(
      provider.inspectTargetSupport({
        path: "/tmp/sample.elf",
        sha256: "b".repeat(64),
        kind: "executable",
        format: "elf",
        architecture: "x86_64",
        availableArchitectures: ["x86_64"],
      }),
    ).toMatchObject({
      status: "supported",
      code: null,
    });
  });
});
