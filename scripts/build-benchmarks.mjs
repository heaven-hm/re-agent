import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const recipes = [
  "scripts/calculator/build.sh",
  "benchmarks/native-windows-ports/snake/replica/build.sh",
  "benchmarks/native-windows-ports/pixeltetris/replica/build.sh",
  "benchmarks/native-windows-ports/tetris/replica/build.sh",
  "benchmarks/native-windows-ports/notepad/replica/build.sh",
  "benchmarks/native-windows-ports/clipjar/replica/build.sh",
  "benchmarks/native-windows-ports/gconv/replica/build.sh",
  "benchmarks/native-windows-ports/imgview/replica/build.sh",
  "benchmarks/plink/replica/build.sh",
  "benchmarks/native-batch-2/reconstructed/fd/build.sh",
  "benchmarks/native-batch-2/reconstructed/ripgrep/build.sh",
  "benchmarks/native-batch-2/reconstructed/bat/build.sh",
];

if (process.platform !== "darwin") {
  throw new Error(
    "The checked-in desktop replicas currently target macOS; run this build on macOS.",
  );
}

const failures = [];
for (const recipe of recipes) {
  const path = resolve(root, recipe);
  if (!existsSync(path)) {
    failures.push(`${recipe}: build recipe is missing`);
    continue;
  }

  process.stdout.write(`\n==> ${recipe}\n`);
  const result = spawnSync("bash", [path], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error !== undefined)
    failures.push(`${recipe}: ${result.error.message}`);
  else if (result.status !== 0)
    failures.push(`${recipe}: exited with ${result.status}`);
}

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} benchmark build(s) failed:\n`);
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nBuilt ${recipes.length} macOS benchmark replicas.\n`);
  process.stdout.write(
    "Outputs are host-specific and remain under ignored build/ directories.\n",
  );
}
