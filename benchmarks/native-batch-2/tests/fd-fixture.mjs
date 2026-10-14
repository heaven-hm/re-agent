/** Declared native fd runtime experiment tree; no upstream sources involved. */
import { mkdir, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";

export async function createFdFixture(directory) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const files = {
    "alpha.txt": "alpha\n",
    "UPPER.TXT": "upper\n",
    "data.bin": "binary\0\n",
    ".hidden.txt": "hidden\n",
    ".gitignore": "ignored.txt\nignored-dir/\n",
    "ignored.txt": "ignored\n",
    "sub/beta.txt": "beta\n",
    "sub/deep/gamma.txt": "gamma\n",
    "ignored-dir/secret.txt": "ignored directory\n",
    "café.txt": "unicode\n",
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(resolve(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), content);
  }
  await mkdir(join(root, ".git"), { recursive: true });
  await mkdir(join(root, "empty"), { recursive: true });
  try {
    await symlink("alpha.txt", join(root, "link.txt"));
  } catch (cause) {
    if (cause.code !== "EEXIST") throw cause;
  }
  return root;
}

export const fdProbeCases = [
  { id: "all", arguments: ["--color", "never", "--threads", "1", ".", "."] },
  {
    id: "regex",
    arguments: ["--color", "never", "--threads", "1", "^a.*\\.txt$", "."],
  },
  {
    id: "glob",
    arguments: ["--color", "never", "--threads", "1", "--glob", "*.txt", "."],
  },
  {
    id: "extension",
    arguments: ["--color", "never", "--threads", "1", "-e", "txt", ".", "."],
  },
  {
    id: "hidden",
    arguments: ["--color", "never", "--threads", "1", "--hidden", ".", "."],
  },
  {
    id: "no-ignore",
    arguments: ["--color", "never", "--threads", "1", "--no-ignore", ".", "."],
  },
  {
    id: "files",
    arguments: ["--color", "never", "--threads", "1", "--type", "f", ".", "."],
  },
  {
    id: "directories",
    arguments: ["--color", "never", "--threads", "1", "--type", "d", ".", "."],
  },
  {
    id: "symlinks",
    arguments: ["--color", "never", "--threads", "1", "--type", "l", ".", "."],
  },
  {
    id: "depth",
    arguments: [
      "--color",
      "never",
      "--threads",
      "1",
      "--max-depth",
      "1",
      ".",
      ".",
    ],
  },
  {
    id: "unicode",
    arguments: ["--color", "never", "--threads", "1", "café", "."],
  },
  {
    id: "invalid-regex",
    arguments: ["--color", "never", "--threads", "1", "[", "."],
  },
  { id: "invalid-option", arguments: ["--invalid-option"] },
  { id: "version", arguments: ["--version"] },
  { id: "help", arguments: ["--help"] },
];

if (process.argv[1] === import.meta.filename) {
  console.log(await createFdFixture(process.argv[2]));
}
