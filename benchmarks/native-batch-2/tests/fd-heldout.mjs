/** Seeded held-out tree for arbitrary native search inputs, not canned outputs. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
export async function createFdHeldoutFixture(directory, seed = 34001) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  let state = seed;
  const files = [];
  for (let index = 0; index < 24; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const depth = state % 4,
      extension = ["txt", "bin", "log"][index % 3];
    const name =
      (index % 7 === 0 ? "." : "") +
      (index % 5 === 0 ? "NODE" : "node") +
      state.toString(16) +
      (index % 6 === 0 ? "-café" : "") +
      "." +
      extension;
    const path = join(
      ...Array.from({ length: depth }, (_, level) => "level" + level),
      name,
    );
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `${seed}:${index}:${state}\n`);
    files.push(path);
  }
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".gitignore"), "ignored.log\n");
  await writeFile(join(root, "ignored.log"), "ignore fixture\n");
  await writeFile(
    join(root, "fixture-manifest.json"),
    JSON.stringify({ seed, files }, null, 2) + "\n",
  );
  return root;
}
export const fdHeldoutCases = [
  { id: "all", arguments: [".", "."] },
  { id: "logs", arguments: ["--glob", "*.log", "."] },
  { id: "binary", arguments: ["-e", "bin", ".", "."] },
  { id: "depth-two", arguments: ["--max-depth", "2", ".", "."] },
  { id: "hidden", arguments: ["--hidden", ".", "."] },
  { id: "sensitive", arguments: ["-s", "NODE", "."] },
  { id: "insensitive", arguments: ["-i", "NODE", "."] },
  { id: "regex", arguments: ["node[0-9a-f]+", "."] },
  { id: "unicode", arguments: ["café", "."] },
  { id: "directories", arguments: ["--type", "d", ".", "."] },
].map((item) => ({
  ...item,
  arguments: ["--color", "never", "--threads", "1", ...item.arguments],
}));
if (process.argv[1] === import.meta.filename)
  console.log(await createFdHeldoutFixture(process.argv[2]));
