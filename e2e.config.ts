import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  targets: [
    {
      engine: web(),
      app: {
        url: process.env.APP_URL ?? "http://127.0.0.1:3000",
        command: {
          executable: "npm",
          args: [
            "run",
            "docs:dev",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            "3000",
          ],
        },
      },
    },
  ],
} satisfies E2EConfig;
