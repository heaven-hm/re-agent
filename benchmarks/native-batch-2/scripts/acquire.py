#!/usr/bin/env python3
"""Acquire only the explicitly requested published Windows release assets."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import struct
import shutil
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ("fd", "sharkdp/fd", "v10.5.0", "fd-v10.5.0-x86_64-pc-windows-msvc.zip", "fd.exe"),
    ("ripgrep", "BurntSushi/ripgrep", "15.2.0", "ripgrep-15.2.0-x86_64-pc-windows-msvc.zip", "rg.exe"),
    ("bat", "sharkdp/bat", "v0.26.1", "bat-v0.26.1-x86_64-pc-windows-msvc.zip", "bat.exe"),
    ("openlierox", "openlierox/openlierox", "20260912.1", "openlierox-20260912.1-windows.zip", None),
    ("supertux", "SuperTux/supertux", "v0.7.0", "SuperTux-v0.7.0-win64-portable.zip", None),
    ("powder-toy", "The-Powder-Toy/The-Powder-Toy", "v100.1.400", "powder-v100.1.400-x86_64-windows-mingw.exe", None),
]

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def pe_inventory(path):
    data = path.read_bytes()
    if data[:2] != b"MZ":
        raise ValueError("Not an MZ executable")
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe+4] != b"PE\0\0":
        raise ValueError("Not a Windows PE executable")
    machine, sections = struct.unpack_from("<HH", data, pe+4)
    optional_size = struct.unpack_from("<H", data, pe+20)[0]
    opt = pe+24
    magic = struct.unpack_from("<H", data, opt)[0]
    if magic not in (0x10B, 0x20B):
        raise ValueError("Unsupported optional header")
    directory = opt+(112 if magic == 0x20B else 96)
    count = struct.unpack_from("<I", data, directory-4)[0]
    image_base = struct.unpack_from("<Q" if magic == 0x20B else "<I", data, opt+(24 if magic == 0x20B else 28))[0]
    section_records = []
    for i in range(sections):
        at = opt+optional_size+40*i
        virtual_size, rva, raw_size, raw_offset = struct.unpack_from("<IIII", data, at+8)
        section_records.append({"name": data[at:at+8].split(b"\0")[0].decode("ascii", "replace"), "rva": rva, "virtual_bytes": virtual_size, "file_offset": raw_offset, "file_bytes": raw_size})
    def offset(rva):
        for s in section_records:
            if s["rva"] <= rva < s["rva"]+s["file_bytes"]:
                result=s["file_offset"]+rva-s["rva"]
                if result < len(data): return result
        raise ValueError("Unmapped RVA")
    imports=[]
    import_rva = struct.unpack_from("<I", data, directory+8)[0] if count > 1 else 0
    if import_rva:
        at=offset(import_rva)
        for _ in range(4096):
            desc=struct.unpack_from("<IIIII", data, at)
            if not any(desc): break
            start=offset(desc[3]); end=data.find(b"\0", start, min(start+4096,len(data)))
            if end < 0: raise ValueError("Unterminated DLL import")
            imports.append(data[start:end].decode("ascii", "replace")); at+=20
        else: raise ValueError("Import descriptor budget exceeded")
    clr = struct.unpack_from("<II", data, directory+14*8) if count > 14 else (0,0)
    if any(clr): raise ValueError("Managed CLR target rejected")
    return {"path": str(path.relative_to(ROOT)), "sha256": sha(path), "bytes": len(data), "format": "PE32+" if magic==0x20B else "PE32", "machine": hex(machine), "architecture": {0x8664:"x86_64",0x14c:"x86",0xaa64:"arm64"}.get(machine,"unknown"), "image_base": hex(image_base), "entry_rva": hex(struct.unpack_from("<I",data,opt+16)[0]), "clr_directory": list(clr), "imports": imports, "sections": section_records}

def acquire(spec):
    name,repo,version,asset_name,exe_name=spec
    start=time.monotonic(); dest=ROOT/"originals"/name; dest.mkdir(parents=True,exist_ok=True)
    url=f"https://github.com/{repo}/releases/download/{version}/{asset_name}"
    result={"target":name,"version":version,"download_url":url,"started_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"status":"FAIL"}
    try:
        response=subprocess.run(["gh","api",f"repos/{repo}/releases/tags/{version}"],capture_output=True,text=True,check=True,timeout=60)
        release=json.loads(response.stdout)
        (dest/"release-metadata.json").write_text(json.dumps(release,indent=2)+"\n")
        asset=next(a for a in release["assets"] if a["name"]==asset_name)
        result["release_url"]=release["html_url"];result["publisher_digest"]=asset.get("digest")
        archive=dest/asset_name
        if not archive.exists() or archive.stat().st_size != asset["size"]:
            temporary=archive.with_suffix(archive.suffix+".partial")
            retained=temporary.stat().st_size if temporary.exists() else 0
            if shutil.disk_usage(dest).free < asset["size"]-retained+512*1024**2:
                raise OSError("Insufficient free disk for remaining download plus 512 MiB reserve")
            subprocess.run(["curl","--fail","--location","--proto","=https","--proto-redir","=https","--retry","2","--connect-timeout","20","--max-time","600","--continue-at","-","--output",str(temporary),url],check=True,capture_output=True,timeout=650)
            temporary.replace(archive)
        digest=sha(archive)
        if asset.get("digest") and asset["digest"] != "sha256:"+digest:
            raise ValueError("Publisher SHA-256 mismatch")
        result.update(archive_sha256=digest,archive_bytes=archive.stat().st_size,publisher_digest_verified=bool(asset.get("digest")))
        extracted=dest/"extracted";extracted.mkdir(exist_ok=True)
        if archive.suffix==".zip":
            with zipfile.ZipFile(archive) as z:
                infos=z.infolist()
                result["archive_entries"]=len(infos)
                if sum(i.file_size for i in infos)>4*1024**3: raise ValueError("Archive expansion budget exceeded")
                for item in infos:
                    target=(extracted/item.filename).resolve()
                    if not target.is_relative_to(extracted.resolve()):raise ValueError("Unsafe archive path")
                    if (item.external_attr>>16)&0o170000 == 0o120000:raise ValueError("Archive symlink rejected")
                expansion=sum(i.file_size for i in infos if not (extracted/i.filename).exists())
                if shutil.disk_usage(dest).free < expansion+512*1024**2:
                    selected=[i for i in infos if i.filename.lower().endswith((".exe",".dll")) or any(t in Path(i.filename).name.lower() for t in ("license","licence","copying","notice"))]
                    selected_size=sum(i.file_size for i in selected if not (extracted/i.filename).exists())
                    if shutil.disk_usage(dest).free < selected_size+512*1024**2:
                        raise OSError("Insufficient disk to extract PE binaries with reserve")
                    for item in selected:z.extract(item,extracted)
                    result["asset_extraction"]="PARTIAL: binaries/notices extracted; full assets retained in verified archive, disk reserve prevents full extraction"
                else:
                    z.extractall(extracted)
                    result["asset_extraction"]="complete"
            candidates=sorted(extracted.rglob(exe_name or "*.exe"))
        else: candidates=[archive]
        result["executables"]=[pe_inventory(p) for p in candidates]
        result["bundled_dlls"]=[str(p.relative_to(ROOT)) for p in sorted(extracted.rglob("*.dll"))]
        result["license_notice_files"]=[str(p.relative_to(ROOT)) for p in extracted.rglob("*") if p.is_file() and any(t in p.name.lower() for t in ("license","licence","copying","notice","copyright"))]
        if not result["executables"]:raise ValueError("No native executable found")
        result["status"]="PASS"
    except Exception as error:
        result["error"]=str(error)
        if isinstance(error,subprocess.CalledProcessError):result["diagnostic"]=error.stderr.decode(errors="replace") if isinstance(error.stderr,bytes) else error.stderr
    result["duration_seconds"]=time.monotonic()-start
    (ROOT/"manifests"/f"{name}-acquisition.json").write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps({"target":name,"status":result["status"],"executables":len(result.get("executables",[])),"error":result.get("error")}),flush=True)
    return result

if __name__=="__main__":
    for folder in ("originals","analysis","reconstructed","tests","screenshots","logs","reports","manifests","scripts"):
        (ROOT/folder).mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        results=list(executor.map(acquire,TARGETS))
    (ROOT/"reports"/"binary-inventory.json").write_text(json.dumps(results,indent=2)+"\n")
