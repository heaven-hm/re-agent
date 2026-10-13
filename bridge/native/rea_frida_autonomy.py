#!/usr/bin/env python3
"""Owned-child Frida experiment. Never attaches to an ambient process."""
import hashlib
import json
import os
import signal
import subprocess
import sys
import threading
import tempfile
import shutil
import socket
import secrets
import time


def digest(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(config):
    import frida
    binary = os.path.realpath(config["binaryPath"])
    if digest(binary) != config["binarySha256"]:
        raise ValueError("Binary identity changed before launch")
    stop = threading.Event()
    messages = []
    message_error = []
    lock = threading.Lock()
    child = None
    session = None
    gadget_root = None
    remote_address = None
    remote_manager = None
    reservation = None
    report = {"status": "failed", "frida_version": frida.__version__, "events": [], "cleanup": {"reaped": True, "no_child_launched": True}}
    old_term = signal.signal(signal.SIGTERM, lambda *_: stop.set())
    old_int = signal.signal(signal.SIGINT, lambda *_: stop.set())
    captures = {"stdout": bytearray(), "stderr": bytearray()}
    overflow = threading.Event()
    readers = []
    deadline = time.monotonic() + config["timeoutMs"] / 1000
    try:
        child_environment = {key: value for key, value in os.environ.items() if key in ("PATH", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "REA_PROCESS_RUN_ID")}
        if config.get("gadgetPath") is not None:
            original_gadget = os.path.realpath(config["gadgetPath"])
            if digest(original_gadget) != config["gadgetSha256"]:
                raise ValueError("Gadget library hash differs before preload")
            gadget_root = tempfile.mkdtemp(prefix="rea-frida-gadget-")
            private_gadget = os.path.join(gadget_root, "FridaGadget.dylib")
            shutil.copyfile(original_gadget, private_gadget)
            if digest(private_gadget) != config["gadgetSha256"]:
                raise ValueError("Private Gadget copy hash differs")
            reservation = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            reservation.bind(("127.0.0.1", config.get("gadgetPort", 0)))
            port = reservation.getsockname()[1]
            token = secrets.token_hex(32)
            private_config = os.path.join(gadget_root, "FridaGadget.config")
            with open(private_config, "x", encoding="utf-8") as stream:
                json.dump({"interaction": {"type": "listen", "address": "127.0.0.1", "port": port, "on_port_conflict": "fail", "on_load": "resume", "token": token}, "teardown": "full"}, stream)
            os.chmod(private_config, 0o600)
            child_environment["DYLD_INSERT_LIBRARIES"] = private_gadget
            remote_address = "127.0.0.1:" + str(port)
            report["gadget"] = {"profile": "owned-private-preload", "sha256": config["gadgetSha256"], "loopback_port": port, "authenticated_listener": True}
            reservation.close()
            reservation = None
        print("frida-autonomy: launching owned gated target", file=sys.stderr, flush=True)
        child = subprocess.Popen([binary, *config["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=child_environment)
        report["cleanup"] = {"reaped": False}
        report["owned_child_pid"] = child.pid
        report["owned_process_group"] = os.getpgrp()
        def drain(name, stream):
            while True:
                chunk = stream.read(4096)
                if not chunk:
                    break
                available = 65536 - len(captures[name])
                captures[name].extend(chunk[:max(0, available)])
                if len(chunk) > available:
                    overflow.set()
        for name in captures:
            thread = threading.Thread(target=drain, args=(name, getattr(child, name)), daemon=True)
            thread.start()
            readers.append(thread)
        print("frida-autonomy: attaching owned child", file=sys.stderr, flush=True)
        if remote_address is None:
            session = frida.get_local_device().attach(child.pid)
        else:
            remote_manager = frida.get_device_manager()
            device = remote_manager.add_remote_device(remote_address, token=token)
            while True:
                if stop.is_set() or time.monotonic() >= deadline or child.poll() is not None:
                    raise RuntimeError("Owned Gadget did not become available before target exit/deadline")
                try:
                    processes = device.enumerate_processes()
                    if len(processes) != 1 or processes[0].name != "Gadget":
                        raise RuntimeError("Authenticated Gadget process inventory differs from owned listener")
                    session = device.attach(processes[0].pid)
                    break
                except frida.TransportError:
                    stop.wait(0.05)
                except frida.ServerNotRunningError:
                    stop.wait(0.05)
        print("frida-autonomy: attached, validating runtime module", file=sys.stderr, flush=True)
        settings = json.dumps({"path": binary, "address": config["staticAddress"], "base": config["preferredBase"], "prefix": config["codePrefix"], "maxEvents": config["maxEvents"], "pid": child.pid})
        script = session.create_script("""
const settings = SETTINGS;
if (Process.codeSigningPolicy === 'required') throw new Error('Code signing policy requires signed code; instrumentation refused');
if (Process.id !== settings.pid) throw new Error('Instrumented runtime PID differs from owned Popen child');
const module = Process.mainModule;
if (module.path !== settings.path) throw new Error('Main module identity differs from selected binary');
const address = module.base.add(ptr(settings.address).sub(ptr(settings.base)));
const length = settings.prefix.length / 2;
if (address.compare(module.base) < 0 || address.add(length).compare(module.base.add(module.size)) > 0) throw new Error('Function range outside main module');
const prefix = Array.from(new Uint8Array(address.readByteArray(length))).map(x => x.toString(16).padStart(2, '0')).join('');
if (prefix !== settings.prefix) throw new Error('Static/runtime instruction prefix mismatch');
let count = 0;
Interceptor.attach(address, {
    onEnter(args) { this.admitted = count++ < settings.maxEvents; if (this.admitted) this.argument = args[0].toString(); },
    onLeave(value) { if (this.admitted) send({type:'call', arg0_bits:this.argument, return_bits:value.toString(), thread_id:this.threadId}); else send({type:'event-limit'}); }
});
Interceptor.flush();
send({type:'attached', static_address:settings.address, preferred_base:settings.base, runtime_address:address.toString(), runtime_base:module.base.toString(), module_path:module.path, module_size:module.size, code_prefix:prefix, architecture:Process.arch, pointer_size:Process.pointerSize, code_signing_policy:Process.codeSigningPolicy, runtime_pid:Process.id});
""".replace("SETTINGS", settings))
        def receive(message, _data):
            with lock:
                if message.get("type") == "send":
                    if len(messages) >= config["maxEvents"] + 4:
                        message_error.append("Message limit exceeded")
                        stop.set()
                    else:
                        messages.append(message["payload"])
                else:
                    message_error.append(message.get("description", str(message)))
                    stop.set()
        script.on("message", receive)
        script.load()
        print("frida-autonomy: script loaded", file=sys.stderr, flush=True)
        while not any(m.get("type") == "attached" for m in messages):
            if stop.wait(0.01) or time.monotonic() >= deadline or child.poll() is not None:
                raise RuntimeError("Instrumentation did not become ready: " + "; ".join(message_error))
        # The target is gated on stdin. No input is released before validated attachment.
        child.stdin.write(config["stdin"].encode("utf-8"))
        child.stdin.close()
        while child.poll() is None:
            if stop.wait(0.01) or overflow.is_set() or time.monotonic() >= deadline:
                raise TimeoutError("Interrupted, timed out, or target output limit exceeded")
        # Frida IPC can deliver its final onLeave after target exit notification.
        settle = min(deadline, time.monotonic() + 0.25)
        while time.monotonic() < settle and not stop.wait(0.01):
            pass
        if message_error or any(m.get("type") == "event-limit" for m in messages):
            raise RuntimeError("Incomplete instrumentation: " + "; ".join(message_error))
        calls = [m for m in messages if m.get("type") == "call"]
        if not calls:
            raise RuntimeError("No completed function call observed")
        if child.returncode != 0:
            raise RuntimeError("Target returned nonzero exit")
        for call in calls:
            for field in ("arg0_bits", "return_bits"):
                raw = int(call[field], 16)
                call[field.replace("bits", "signed64_assumption")] = str(raw - (1 << 64) if raw >= (1 << 63) else raw)
        if digest(binary) != config["binarySha256"]:
            raise ValueError("Binary identity changed during execution")
        report["status"] = "runtime-observed"
    except Exception as error:
        report["error"] = str(error)
    finally:
        report["events"] = messages
        if child is not None:
            # Popen retains the unreaped child identity. Never signal a PID looked up later.
            try:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=1)
                else:
                    child.wait()
                report["cleanup"] = {"reaped": True, "exit_code": child.returncode, "owned_child_only": True}
            except Exception as error:
                report["cleanup"] = {"reaped": False, "error": str(error), "owned_child_only": True}
                report["status"] = "failed"
            for reader in readers:
                reader.join(timeout=0.5)
            report["stdout"] = captures["stdout"].decode("utf-8", errors="replace")
            report["stderr"] = captures["stderr"].decode("utf-8", errors="replace")
            report["output_truncated"] = overflow.is_set()
            if overflow.is_set():
                report["status"] = "failed"
        if session is not None:
            try:
                if not session.is_detached:
                    session.detach()
                report["cleanup"]["session_detached"] = True
            except Exception as error:
                report["cleanup"]["session_detach_error"] = str(error)
                report["status"] = "failed"
        if reservation is not None:
            reservation.close()
        if remote_manager is not None and remote_address is not None:
            try:
                remote_manager.remove_remote_device(remote_address)
                report["cleanup"]["gadget_connection_removed"] = True
            except Exception as error:
                report["cleanup"]["gadget_connection_error"] = str(error)
                report["status"] = "failed"
        if gadget_root is not None:
            if report["cleanup"].get("reaped"):
                try:
                    shutil.rmtree(gadget_root)
                    report["cleanup"]["private_gadget_removed"] = True
                except Exception as error:
                    report["cleanup"]["gadget_directory_error"] = str(error)
                    report["status"] = "failed"
            else:
                report["cleanup"]["retained_private_gadget_directory"] = gadget_root
        signal.signal(signal.SIGTERM, old_term)
        signal.signal(signal.SIGINT, old_int)
    return report


if __name__ == "__main__":
    try:
        payload = run(json.loads(sys.argv[1]))
    except Exception as failure:
        payload = {"status": "failed", "error": str(failure), "events": [], "cleanup": {"reaped": True, "no_child_launched": True}}
    print(json.dumps(payload, sort_keys=True))
