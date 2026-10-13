import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "node:http";
import { expect, it, onTestFinished } from "vitest";
import { createTestTempDirectory } from "../fixtures/temporaryDirectory.js";
import { startAutonomyDashboard } from "../../src/composition/autonomyDashboard.js";

it("dashboard restricts local controls to its session token and origin", async () => {
  const root = await createTestTempDirectory("rea-autonomy-dashboard-");
  const planPath = join(root, "plan.json");
  await writeFile(
    planPath,
    JSON.stringify({
      investigation: {
        workspace: root,
        binaryPath: process.execPath,
        original: { command: process.execPath, arguments: [] },
        replica: { command: process.execPath, arguments: [] },
        cases: [{ id: "one" }],
      },
    }),
  );
  const dashboard = await startAutonomyDashboard(
    planPath,
    join(root, "checkpoint.json"),
  );
  onTestFinished(() => dashboard.close());
  const token = new URL(dashboard.url).pathname.split("/").at(-1)!;
  expect((await fetch(dashboard.url)).status).toBe(200);
  expect((await fetch(`${dashboard.url}/state`)).status).toBe(403);
  expect(
    (
      await fetch(`${dashboard.url}/start`, {
        method: "POST",
        headers: { "x-rea-token": "wrong" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${dashboard.url}/state`, {
        headers: { "x-rea-token": token, origin: "https://untrusted.example" },
      })
    ).status,
  ).toBe(403);
  const hostStatus = await new Promise<number>((resolve, reject) => {
    const raw = request(
      `${dashboard.url}/state`,
      { headers: { "x-rea-token": token, host: "untrusted.example" } },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      },
    );
    raw.on("error", reject);
    raw.end();
  });
  expect(hostStatus).toBe(403);
  const state = await fetch(`${dashboard.url}/state`, {
    headers: { "x-rea-token": token },
  });
  expect(await state.json()).toMatchObject({
    active: false,
    state: { status: "ready" },
  });
  expect(
    (
      await fetch(`${dashboard.url}/unrelated`, {
        method: "POST",
        headers: { "x-rea-token": token },
      })
    ).status,
  ).toBe(404);
});
