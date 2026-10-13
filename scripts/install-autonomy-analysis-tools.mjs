#!/usr/bin/env node
/** Workspace-local, wheel-only installation. No global environment changes. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve("output/autonomy/tools-python");
const python = process.env.REA_BOOTSTRAP_PYTHON || "python3";
const fixture = resolve(
  process.argv[2] || "output/autonomy/reconstruction-1791837432410/original",
);
const packages = ["frida", "capstone", "lief", "z3-solver", "angr", "Pillow"];
const modules = ["frida", "capstone", "lief", "z3", "angr", "PIL"];
const report = {
  createdAt: new Date().toISOString(),
  root,
  fixture,
  packages: [],
  wheels: [],
  health: [],
  scope:
    "Import and native-binary smoke tests; no runtime hooking or equivalence claim.",
};
await mkdir(root, { recursive: true });
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
async function verifyWheels(wheels) {
  for (const filename of await readdir(wheels)) {
    if (!filename.endsWith(".whl"))
      throw new Error(`Unexpected non-wheel artifact: ${filename}`);
    const [distribution, version] = filename.split("-");
    const response = await fetch(
      `https://pypi.org/pypi/${distribution}/${version}/json`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw new Error(`PyPI metadata ${distribution}: ${response.status}`);
    const metadata = await response.json();
    const entry = metadata.urls.find((item) => item.filename === filename);
    const digest = createHash("sha256")
      .update(await readFile(join(wheels, filename)))
      .digest("hex");
    if (
      !entry ||
      entry.digests.sha256 !== digest ||
      new URL(entry.url).hostname !== "files.pythonhosted.org"
    )
      throw new Error(
        `Official wheel provenance/hash check failed: ${filename}`,
      );
    report.wheels.push({
      filename,
      sha256: digest,
      url: entry.url,
      metadataUrl: response.url,
      license: metadata.info.license,
      licenseExpression: metadata.info.license_expression,
    });
  }
}
async function save() {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(join(root, "bootstrap-report.json"), content);
  await writeFile(
    join(
      root,
      `bootstrap-report-${report.createdAt.replaceAll(":", "-")}.json`,
    ),
    content,
  );
}
try {
  report.platform = JSON.parse(
    run(python, [
      "-c",
      "import sys,platform,json; print(json.dumps(dict(python=sys.version,platform=platform.system(),architecture=platform.machine())))",
    ]),
  );
  for (let index = 0; index < modules.length; index++) {
    try {
      let interpreter = join(root, "venv", "bin", "python");
      try {
        run(interpreter, ["-c", `import ${modules[index]}`], 30000);
      } catch {
        interpreter = python;
      }
      const version = run(
        interpreter,
        [
          "-c",
          `import ${modules[index]}; import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(packages[index])}))`,
        ],
        30000,
      );
      report.packages.push({
        package: packages[index],
        status: "reused",
        version,
        interpreter,
      });
    } catch {
      report.packages.push({ package: packages[index], status: "missing" });
    }
  }
  const missing = report.packages
    .filter((item) => item.status === "missing")
    .map((item) => item.package);
  if (missing.length) {
    const venv = join(root, "venv");
    run(python, ["-m", "venv", venv]);
    const localPython = join(venv, "bin", "python");
    const inputs = join(root, "requirements.in");
    await writeFile(inputs, missing.join("\n") + "\n");
    const lock = join(root, `requirements-install-${Date.now()}.lock`);
    report.installLock = lock;
    const uv = process.env.REA_BOOTSTRAP_UV || "uv";
    const compileArgs = [
      "pip",
      "compile",
      inputs,
      "--python",
      localPython,
      "--generate-hashes",
      "--only-binary",
      ":all:",
      "--index-url",
      "https://pypi.org/simple",
      "--output-file",
      lock,
    ];
    try {
      run(uv, compileArgs);
    } catch (error) {
      if (!missing.includes("angr")) throw error;
      const optional = report.packages.find((item) => item.package === "angr");
      optional.status = "skipped";
      optional.reason = String(error);
      await writeFile(join(root, "angr-resolution-failure.txt"), String(error));
      await writeFile(
        inputs,
        missing.filter((name) => name !== "angr").join("\n") + "\n",
      );
      run(uv, compileArgs);
    }
    const wheels = join(root, `wheels-${Date.now()}`);
    await mkdir(wheels);
    run(localPython, [
      "-m",
      "pip",
      "download",
      "--require-hashes",
      "--only-binary=:all:",
      "--index-url",
      "https://pypi.org/simple",
      "-r",
      lock,
      "--dest",
      wheels,
    ]);
    await verifyWheels(wheels);
    await writeFile(
      join(root, "wheel-provenance.json"),
      JSON.stringify(report.wheels, null, 2),
    );
    run(localPython, [
      "-m",
      "pip",
      "install",
      "--no-index",
      "--find-links",
      wheels,
      "--require-hashes",
      "-r",
      lock,
    ]);
    for (const item of report.packages.filter(
      (item) => item.status === "missing",
    )) {
      item.status = "installed";
      item.interpreter = localPython;
      item.version = run(localPython, [
        "-c",
        `import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(item.package)}))`,
      ]);
    }
  }
  if (report.wheels.length === 0) {
    for (const directory of (await readdir(root)).filter((name) =>
      name.startsWith("wheels-"),
    )) {
      const wheels = join(root, directory);
      await verifyWheels(wheels);
    }
  }
  await writeFile(
    join(root, "wheel-provenance.json"),
    JSON.stringify(report.wheels, null, 2),
  );
  const healthProgram = String.raw`
import sys,json,hashlib
from pathlib import Path
name=sys.argv[1]; binary=Path(sys.argv[2]); result={'tool':name}
try:
 if name=='frida':
  import frida
  device=frida.get_local_device(); result.update(version=frida.__version__,device={'id':device.id,'type':device.type})
 elif name=='z3-solver':
  import z3
  x=z3.Int('x'); solver=z3.Solver(); solver.add(x>4,x<6); assert solver.check()==z3.sat; assert solver.model()[x].as_long()==5
  result.update(version=z3.get_version_string(),model=5)
 elif name=='lief':
  import lief
  image=lief.parse(str(binary)); assert image is not None
  result.update(format=str(image.format),sections=len(image.sections),sha256=hashlib.sha256(binary.read_bytes()).hexdigest())
 elif name=='capstone':
  import struct,capstone
  data=binary.read_bytes(); assert data[:4]==bytes.fromhex('cffaedfe'), 'Smoke fixture must be thin little-endian Mach-O64'
  cpu=struct.unpack_from('<I',data,4)[0]; count=struct.unpack_from('<I',data,16)[0]; offset=32; text=None
  for _ in range(count):
   command,size=struct.unpack_from('<II',data,offset)
   assert size>=8 and offset+size<=len(data)
   if command==0x19:
    sections=struct.unpack_from('<I',data,offset+64)[0]
    for index in range(sections):
     position=offset+72+index*80; assert position+80<=offset+size
     if data[position:position+16].split(b'\0')[0]==b'__text':
      address,length,file_offset=struct.unpack_from('<QQI',data,position+32); text=(address,data[file_offset:file_offset+min(length,64)])
   offset+=size
  assert text is not None
  arch,mode=(capstone.CS_ARCH_ARM64,capstone.CS_MODE_ARM) if cpu==0x100000c else (capstone.CS_ARCH_X86,capstone.CS_MODE_64)
  instructions=list(capstone.Cs(arch,mode).disasm(text[1],text[0])); assert instructions
  result.update(instructions=[{'address':hex(i.address),'mnemonic':i.mnemonic,'operands':i.op_str} for i in instructions],sha256=hashlib.sha256(binary.read_bytes()).hexdigest())
 elif name=='Pillow':
  from PIL import Image,ImageChops
  import io
  image=Image.new('RGBA',(2,2),(255,128,0,255)); stream=io.BytesIO(); image.save(stream,format='PNG'); stream.seek(0)
  restored=Image.open(stream); assert ImageChops.difference(image,restored).getbbox() is None
  result.update(format='PNG',pixels=4,comparison='identical')
 elif name=='angr':
  import angr
  project=angr.Project(str(binary),auto_load_libs=False)
  result.update(loader=str(project.loader.main_object),entry=hex(project.entry))
 result['status']='passed'
except Exception as error:
 result.update(status='failed',reason=str(error),exception=type(error).__name__)
print(json.dumps(result))
`;
  for (const item of report.packages) {
    if (item.status === "skipped") {
      report.health.push({
        tool: item.package,
        status: "skipped",
        reason: "Wheel-only resolution failed; see angr-resolution-failure.txt",
      });
      continue;
    }
    try {
      report.health.push(
        JSON.parse(
          run(
            item.interpreter,
            ["-c", healthProgram, item.package, fixture],
            90000,
          ),
        ),
      );
    } catch (error) {
      report.health.push({
        tool: item.package,
        status: "failed",
        reason: String(error),
      });
    }
  }
  const pins = [];
  for (const item of report.packages.filter(
    (item) => item.status !== "skipped",
  )) {
    const response = await fetch(
      `https://pypi.org/pypi/${item.package}/${item.version}/json`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw new Error(
        `Pinned release metadata ${item.package}: ${response.status}`,
      );
    const metadata = await response.json();
    const hashes = metadata.urls
      .filter((entry) => entry.packagetype === "bdist_wheel")
      .map((entry) => `--hash=sha256:${entry.digests.sha256}`);
    if (!hashes.length)
      throw new Error(`No wheels for pinned healthy package ${item.package}`);
    pins.push(`${item.package}==${item.version} ${hashes.join(" ")}`);
  }
  await writeFile(join(root, "requirements.lock"), pins.join("\n") + "\n");
  report.reproductionLock = join(root, "requirements.lock");
  report.completedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify(report, null, 2));
  if (report.health.some((item) => item.status !== "passed"))
    process.exitCode = 1;
} catch (error) {
  report.error = String(error);
  await save();
  console.error(report.error);
  process.exitCode = 1;
}
