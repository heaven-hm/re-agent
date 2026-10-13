#!/usr/bin/env node
/** Package original official wheels, source distributions and retained notices. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";

const sourceRoot = resolve("output/autonomy/tools-python");
const name = `rea-analysis-tools-macos-arm64-python312-${Date.now()}`;
const directory = resolve("output/autonomy", name);
const python = join(sourceRoot, "venv/bin/python");
const wheels = join(directory, "wheels");
const sources = join(directory, "sources");
const manifest = {
  schemaVersion: 1,
  name,
  platform: "macos-arm64",
  python: "CPython 3.12",
  minimumMacosVersion: "13.0",
  createdAt: new Date().toISOString(),
  artifacts: [],
  notices: [],
  omitted: [
    {
      tool: "angr",
      reason:
        "No compatible wheel-only dependency resolution on the verified host",
    },
  ],
  licenseReview: {
    scope:
      "Exact unmodified PyPI artifacts and all located license/copyright notices; embedded native dependency source completeness is not proven",
    publicRedistributionApproved: false,
  },
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function run(command, args, timeout = 600000) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      `${command}: ${result.error?.message || result.stderr || result.stdout}`,
    );
  return result.stdout.trim();
}
async function json(url) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}
async function download(entry, destination) {
  if (new URL(entry.url).hostname !== "files.pythonhosted.org")
    throw new Error("Nonofficial package host");
  const response = await fetch(entry.url, {
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Artifact HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 256 * 1024 * 1024 || hash(bytes) !== entry.digests.sha256)
    throw new Error(`Artifact hash or size rejected: ${entry.filename}`);
  await writeFile(destination, bytes, { flag: "wx" });
}
async function collectLiefUpstreamNotices(pin) {
  let noticeCount = 0;

  const upstream = `https://raw.githubusercontent.com/lief-project/LIEF/${pin.version}`;
  for (const [path, filename, required] of [
    ["LICENSE", "LICENSE", "Apache License"],
    [
      "include/LIEF/Abstract/Binary.hpp",
      "upstream-copyright-Binary.hpp",
      "Copyright",
    ],
  ]) {
    const url = `${upstream}/${path}`;
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Exact upstream notice ${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.toString("utf8").includes(required))
      throw new Error(`Unexpected upstream notice ${path}`);
    const relative = `licenses/lief/upstream/${filename}`;
    await mkdir(join(directory, "licenses/lief/upstream"), {
      recursive: true,
    });
    await writeFile(join(directory, relative), bytes);
    manifest.notices.push({
      distribution: "lief",
      file: relative,
      sha256: hash(bytes),
      bytes: bytes.length,
      url,
      provenance:
        "Exact official release-tag HTTPS content; computed digest, no separately published digest asserted",
    });
    noticeCount++;
  }
  manifest.licenseReview.liefNoticeGap =
    "PyPI wheel and sdist omit notices; retained exact upstream release license and copyright header. Full embedded native source completeness is unproven.";
  return noticeCount;
}
const collectNotices = String.raw`
import sys,zipfile,tarfile,pathlib,hashlib,json,re
archive=pathlib.Path(sys.argv[1]); output=pathlib.Path(sys.argv[2]); results=[]
def save(name,data):
 base=pathlib.PurePosixPath(name).name
 if not re.search(r'(license|copying|notice|copyright)',base,re.I): return
 if len(data)>1024*1024: raise ValueError('Notice exceeds size bound')
 digest=hashlib.sha256(data).hexdigest(); safe=re.sub(r'[^a-zA-Z0-9_.-]','_',base)
 target=output/(digest[:16]+'-'+safe); target.write_bytes(data)
 results.append({'archiveEntry':name,'file':target.name,'sha256':digest,'bytes':len(data)})
output.mkdir(parents=True,exist_ok=True)
if zipfile.is_zipfile(archive):
 with zipfile.ZipFile(archive) as package:
  for entry in package.infolist():
   if not entry.is_dir() and re.search(r'(license|copying|notice|copyright)',pathlib.PurePosixPath(entry.filename).name,re.I):
    if entry.file_size>1024*1024: raise ValueError('Notice exceeds size bound')
    save(entry.filename,package.read(entry))
else:
 with tarfile.open(archive,'r:*') as package:
  for entry in package:
   if entry.isfile() and re.search(r'(license|copying|notice|copyright)',pathlib.PurePosixPath(entry.name).name,re.I):
    if entry.size>1024*1024: raise ValueError('Notice exceeds size bound')
    stream=package.extractfile(entry); save(entry.name,stream.read())
print(json.dumps(results))
`;
await mkdir(wheels, { recursive: true });
await mkdir(sources);
try {
  const host = JSON.parse(
    run(python, [
      "-c",
      "import platform,sys,json; print(json.dumps(dict(system=platform.system(),machine=platform.machine(),major=sys.version_info.major,minor=sys.version_info.minor)))",
    ]),
  );
  if (
    host.system !== "Darwin" ||
    host.machine !== "arm64" ||
    host.major !== 3 ||
    host.minor !== 12
  )
    throw new Error("This profile requires macOS arm64 Python 3.12");
  const lock = await readFile(join(sourceRoot, "requirements.lock"), "utf8");
  const expected = new Set([
    "frida",
    "capstone",
    "lief",
    "z3-solver",
    "pillow",
  ]);
  const pins = lock
    .trim()
    .split("\n")
    .map((line) => {
      const match =
        /^([a-zA-Z0-9_-]+)==([a-zA-Z0-9_.+-]+)\s+--hash=sha256:/u.exec(line);
      if (!match || !expected.delete(match[1].toLowerCase()))
        throw new Error("Unexpected or unpinned bundle dependency");
      return { distribution: match[1], version: match[2] };
    });
  if (expected.size) throw new Error("Incomplete dependency lock");
  await writeFile(join(directory, "requirements.lock"), lock);
  run(python, [
    "-m",
    "pip",
    "download",
    "--require-hashes",
    "--only-binary=:all:",
    "--no-deps",
    "--index-url",
    "https://pypi.org/simple",
    "-r",
    join(directory, "requirements.lock"),
    "--dest",
    wheels,
  ]);
  for (const pin of pins) {
    const metadataUrl = `https://pypi.org/pypi/${pin.distribution}/${pin.version}/json`;
    const metadata = await json(metadataUrl);
    const declaredLicense =
      metadata.info.license_expression ||
      metadata.info.license ||
      metadata.info.classifiers
        .filter((value) => value.startsWith("License ::"))
        .join("; ");
    if (!/MIT|Apache|BSD|wxWindows|HPND/iu.test(declaredLicense))
      throw new Error(
        `Unrecognized/restrictive declared license for ${pin.distribution}: ${declaredLicense}`,
      );
    const matched = (await readdir(wheels)).find(
      (filename) =>
        filename.split("-")[0].replaceAll("_", "-").toLowerCase() ===
        pin.distribution.toLowerCase(),
    );
    const entry = metadata.urls.find(
      (candidate) => candidate.filename === matched,
    );
    if (
      !entry ||
      new URL(entry.url).hostname !== "files.pythonhosted.org" ||
      hash(await readFile(join(wheels, matched))) !== entry.digests.sha256
    )
      throw new Error(`Wheel provenance rejected: ${pin.distribution}`);
    const artifacts = [
      { entry, relative: `wheels/${matched}`, path: join(wheels, matched) },
    ];
    for (const source of metadata.urls.filter(
      (candidate) => candidate.packagetype === "sdist",
    )) {
      if (basename(source.filename) !== source.filename)
        throw new Error("Invalid source filename");
      const path = join(sources, source.filename);
      await download(source, path);
      artifacts.push({
        entry: source,
        relative: `sources/${source.filename}`,
        path,
      });
    }
    let noticeCount = 0;
    for (const artifact of artifacts) {
      manifest.artifacts.push({
        distribution: pin.distribution,
        version: pin.version,
        kind: artifact.entry.packagetype,
        file: artifact.relative,
        sha256: artifact.entry.digests.sha256,
        bytes: (await readFile(artifact.path)).length,
        url: artifact.entry.url,
        metadataUrl,
        declaredLicense,
        projectUrls: metadata.info.project_urls,
      });
      const relative = `licenses/${pin.distribution}/${artifact.entry.packagetype}`;
      const notices = JSON.parse(
        run(python, [
          "-c",
          collectNotices,
          artifact.path,
          join(directory, relative),
        ]),
      );
      for (const notice of notices)
        manifest.notices.push({
          distribution: pin.distribution,
          artifact: artifact.relative,
          ...notice,
          file: `${relative}/${notice.file}`,
        });
      noticeCount += notices.length;
    }
    if (!noticeCount && pin.distribution === "lief")
      noticeCount = await collectLiefUpstreamNotices(pin);
    if (!noticeCount)
      throw new Error(
        `No full license/copyright notices found for ${pin.distribution}`,
      );
    if (pin.distribution === "frida") {
      const records = manifest.notices.filter(
        (notice) => notice.distribution === "frida",
      );
      const texts = await Promise.all(
        records.map((notice) => readFile(join(directory, notice.file), "utf8")),
      );
      if (
        !texts.some(
          (text) =>
            text.includes("EXCEPTION NOTICE") &&
            text.includes("binary object code versions"),
        )
      )
        throw new Error(
          "Frida binary exception missing; redistribution review blocked",
        );
      manifest.licenseReview.fridaBinaryException =
        "Original COPYING explicitly permits binary object-code distribution; bundled native dependency obligations still require review";
    }
  }
  const lgplUrl =
    "https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/LGPL-2.0-only.txt";
  const lgplResponse = await fetch(lgplUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!lgplResponse.ok)
    throw new Error(`Referenced LGPL license HTTP ${lgplResponse.status}`);
  const lgplBytes = Buffer.from(await lgplResponse.arrayBuffer());
  if (
    !lgplBytes.toString("utf8").includes("GNU LIBRARY GENERAL PUBLIC LICENSE")
  )
    throw new Error("Referenced LGPL license text invalid");
  const lgplPath = "licenses/frida/COPYING.LIB";
  await writeFile(join(directory, lgplPath), lgplBytes);
  manifest.notices.push({
    distribution: "frida",
    file: lgplPath,
    sha256: hash(lgplBytes),
    bytes: lgplBytes.length,
    url: lgplUrl,
    provenance:
      "Official SPDX v3.27.0 copy of GNU LGPL2.0; computed content digest, no separately published digest asserted",
  });
  await writeFile(
    join(directory, "INSTALL.md"),
    "# REA analysis tools: macOS arm64, Python 3.12\n\nThese are original official wheels, retained source distributions, and license notices. No Apple binaries or REA target artifacts are included.\n\nCreate a workspace environment with `python3.12 -m venv tools-python`, then install offline with `tools-python/bin/python -m pip install --no-index --find-links wheels --require-hashes -r requirements.lock`.\n\nRun REA dependency discovery with `REA_AUTONOMY_PYTHON=/absolute/path/to/tools-python/bin/python rea autonomy-tools --json`. Installation is separate from integration and fidelity verification. angr is omitted.\n\nPublic redistribution is not approved by this script: the retained first-party notices and source archives do not prove complete embedded native dependency source/license coverage. Review manifest.json before publishing.\n",
  );
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const archive = `${directory}.tar.gz`;
  run("tar", ["-czf", archive, "-C", resolve("output/autonomy"), name]);
  const bytes = await readFile(archive);
  const report = {
    archive: basename(archive),
    sha256: hash(bytes),
    bytes: bytes.length,
    artifacts: manifest.artifacts.length,
    notices: manifest.notices.length,
    distributions: pins.map((pin) => `${pin.distribution}==${pin.version}`),
    publicRedistributionApproved: false,
    reason: manifest.licenseReview.scope,
  };
  await writeFile(`${directory}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  manifest.error = String(error);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.error(manifest.error);
  process.exitCode = 1;
}
