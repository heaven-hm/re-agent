import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("autonomous reconstruction documentation renders its investigation guide", async ({
  app,
  browser,
}) => {
  await app.open("/rea/autonomous-reconstruction");
  await expect(browser.locator("h1")).toContainText(
    "Autonomous reconstruction in REA",
  );
  await expect(browser.locator("body")).toContainText(
    "Run and control an investigation",
  );
});
