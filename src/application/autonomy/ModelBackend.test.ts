import { describe, expect, it } from "vitest";
import {
  createModelBackend,
  reconstructionPrompt,
  type ModelProvider,
} from "./ModelBackend.js";

describe("autonomy model boundary", () => {
  it.each([
    "openai",
    "anthropic",
    "google",
    "openrouter",
    "local",
  ] as ModelProvider[])(
    "normalizes %s transport without persisting credentials",
    async (provider) => {
      let captured: RequestInit | undefined;
      const payload =
        provider === "openai"
          ? {
              output: [
                {
                  type: "message",
                  content: [{ type: "output_text", text: "int main(){}" }],
                },
              ],
            }
          : provider === "anthropic"
            ? { content: [{ text: "int main(){}" }] }
            : provider === "google"
              ? {
                  candidates: [
                    { content: { parts: [{ text: "int main(){}" }] } },
                  ],
                }
              : { choices: [{ message: { content: "int main(){}" } }] };
      const backend = createModelBackend(
        {
          provider,
          model: "fixture",
          credentialEnvironmentVariable: "TEST_KEY",
        },
        {
          environment: { TEST_KEY: "secret-fixture" },
          fetch: async (_url, init) => {
            captured = init;
            return new Response(JSON.stringify(payload));
          },
        },
      );
      expect(
        await backend.reconstruct({
          language: "C",
          objective: "Recover addition",
          evidence: [{ id: "trace-1", kind: "runtime", content: [1, 2, 3] }],
        }),
      ).toBe("int main(){}");
      expect(JSON.stringify(backend.config)).not.toContain("secret-fixture");
      expect(captured?.body).toContain("trace-1");
      expect(captured?.redirect).toBe("error");
    },
  );
  it("rejects evidence-free reconstruction and credential-bearing endpoints", () => {
    expect(() =>
      reconstructionPrompt({ language: "C", objective: "x", evidence: [] }),
    ).toThrow("requires evidence");
    expect(() =>
      createModelBackend({
        provider: "openai",
        model: "x",
        baseUrl: "https://secret@example.com",
      }),
    ).toThrow("credentials");
    expect(() =>
      createModelBackend({
        provider: "local",
        model: "x",
        baseUrl: "http://example.com",
      }),
    ).toThrow("HTTPS");
  });
  it("does not expose provider error body or accept empty output", async () => {
    const config = { provider: "local" as const, model: "fixture" };
    const failed = createModelBackend(config, {
      fetch: async () => new Response("credential-secret", { status: 401 }),
    });
    await expect(failed.generate("x")).rejects.toThrow("HTTP 401");
    const empty = createModelBackend(config, {
      fetch: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "" } }] }),
        ),
    });
    await expect(empty.generate("x")).rejects.toThrow("no text");
  });
  it("requires cloud credentials before transport and propagates cancellation", async () => {
    let called = false;
    const backend = createModelBackend(
      { provider: "openai", model: "gpt-6.1-sol" },
      {
        environment: {},
        fetch: async () => {
          called = true;
          return new Response("{}");
        },
      },
    );
    await expect(backend.generate("x")).rejects.toThrow("Missing credential");
    expect(called).toBe(false);
    const cancelled = createModelBackend(
      { provider: "local", model: "fixture" },
      {
        fetch: async (_url, init) => {
          init?.signal?.throwIfAborted();
          return new Response("{}");
        },
      },
    );
    const controller = new AbortController();
    controller.abort();
    await expect(cancelled.generate("x", controller.signal)).rejects.toThrow();
  });
});
