# Original gconv runtime experiments

## Successful observed help

After host resource pressure recovered, the original `gconv.exe` ran through the healthy isolated 64-bit CrossOver worker (32-bit PE through Wow64). `-h` and `/?` returned exit code 0, empty stderr, and byte-identical full GConv 3.5 usage. Raw files `x64-worker-help.stdout.bin` and `x64-worker-question.stdout.bin` retain CR CR LF line endings and non-UTF-8 text without loss. `help-observation-summary.json` provides digest and scope. This is original behavior rather than a guessed imitation; REA Ghidra `gcParseCommandLine` evidence independently identifies the help-generation branch.

Noargs entered GUI initialization (actual original process IMK initialization), then timed out. No process-linked GUI screenshot was captured. No tiny-image conversion or replica comparison was completed.

## Preserved failures and limits

Initial canonical REA capture `noargs-capture.json` preserves a 12-second timeout, zero output, and `cleanup_incomplete` caused by ambiguous Wine process environment boundaries. Temporary resources were retained; no broad Wine termination was performed.

The isolated 32-bit bottle later returned `wineserver crashed` for all three probes. Wrapper exit 0 in those records does **not** prove target success. The formerly healthy temporary 64-bit worker directory then disappeared externally; a newly created persistent worker also returned the Wine crash fault. Later attempts therefore cannot be used as conversion or equivalence evidence.

Original binaries were left unchanged, and experiments used an isolated working directory. CrossOver is a compatibility layer on macOS, not an actual Windows worker. No universal equivalence claim is made.
