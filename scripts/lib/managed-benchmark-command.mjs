/** Shared owned command boundary for managed benchmark tooling. */
import { randomUUID } from "node:crypto";
import { runOwnedCommand } from "../../dist/process/OwnedCommand.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { Writable } from "node:stream";
import { resolve } from "node:path";
const context = new AsyncLocalStorage();
export function managedBenchmarkScope(signal, operation) {
  return context.run({ signal }, operation);
}
export async function managedBenchmarkCommand(command, args, options = {}) {
  const signal = options.signal ?? context.getStore()?.signal;
  signal?.throwIfAborted();
  // REA owns child captures itself: invoke its CLI in this process so cancellation
  // drains those owners rather than killing a parent with differently tagged children.
  if (
    command === process.execPath &&
    resolve(args[0] ?? "") === resolve(import.meta.dirname, "../rea.mjs")
  ) {
    const { createCli } = await import("../../dist/cli-runtime/cli.js");
    const { createCliResultOutput } =
      await import("../../dist/cli-runtime/cliResultOutput.js");
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 180000);
    const cancellation = signal
      ? AbortSignal.any([signal, deadline])
      : deadline;
    let stdout = "";
    let exceeded = false;
    let retainedBytes = 0;
    const append = (text) => {
      if (
        retainedBytes + Buffer.byteLength(text) >
        (options.outputBytes ?? 64 * 1024 * 1024)
      ) {
        exceeded = true;
        process.emit("SIGTERM");
      } else {
        retainedBytes += Buffer.byteLength(text);
        stdout += text;
      }
    };
    const sink = new Writable({
      write(chunk, encoding, callback) {
        append(chunk.toString());
        callback();
      },
    });
    const output = createCliResultOutput(args.slice(1), sink);
    const interrupt = () => process.emit("SIGTERM");
    cancellation.addEventListener("abort", interrupt, { once: true });
    try {
      await createCli(options.env ?? process.env, output).serve(args.slice(1), {
        stdout(text) {
          if (!output?.handled) append(text);
        },
        exit(code) {
          if (code !== 0)
            throw new Error("REA CLI exit " + code + ": " + stdout);
        },
      });
      cancellation.throwIfAborted();
      if (exceeded) throw new Error("REA benchmark CLI output limit exceeded");
      if (output?.failed)
        throw new Error("REA benchmark CLI failed: " + stdout);
      return { stdout, stderr: "" };
    } finally {
      cancellation.removeEventListener("abort", interrupt);
    }
  }
  try {
    const r = await runOwnedCommand(
      {
        command,
        arguments: args,
        cwd: options.cwd,
        env: options.env,
        runId: "rea-engine-managed-" + randomUUID(),
        expectedCommand: null,
      },
      {
        timeoutMs: options.timeoutMs ?? 180000,
        diagnosticBytes: options.outputBytes ?? 64 * 1024 * 1024,
      },
      { signal },
    );
    return { stdout: r.stdout.text, stderr: r.stderr.text };
  } catch (cause) {
    // Preserve the original failure and retained cleanup owner for callers.
    cause.stdout = cause.snapshot?.stdout.text ?? "";
    cause.stderr = cause.snapshot?.stderr.text ?? "";
    throw cause;
  }
}
