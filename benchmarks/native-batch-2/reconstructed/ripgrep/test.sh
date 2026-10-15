#!/bin/sh
set -eu
cd "$(dirname "$0")"
./build.sh
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/sub" "$tmp/.hidden"
printf 'needle one\nNothing\nNEEDLE two\n' > "$tmp/a.txt"
printf 'needle three\n' > "$tmp/sub/b.txt"
printf 'needle hidden\n' > "$tmp/.hidden/c.txt"
./build/rea-rg --color never --sort path --no-heading needle "$tmp" > "$tmp/out"
printf '%s\n' "$tmp/a.txt:needle one" "$tmp/sub/b.txt:needle three" > "$tmp/expected"
diff -u "$tmp/expected" "$tmp/out"
./build/rea-rg --color never --sort path -n -i needle "$tmp" > "$tmp/out"
grep -q 'a.txt:3:NEEDLE two' "$tmp/out"
./build/rea-rg --color never --sort path --hidden -n -F needle "$tmp" > "$tmp/out"
grep -q '.hidden/c.txt:1:needle hidden' "$tmp/out"
printf 'ignored needle\n' > "$tmp/ignored.txt"
printf 'ignored.txt\n' > "$tmp/.gitignore"
./build/rea-rg --color never --sort path -n needle "$tmp" > "$tmp/out"
! grep -q 'ignored.txt' "$tmp/out"
./build/rea-rg --color never --sort path --no-ignore -n needle "$tmp" > "$tmp/out"
grep -q 'ignored.txt:1:ignored needle' "$tmp/out"
set +e
./build/rea-rg --color never --sort path absent "$tmp" > "$tmp/out"
status=$?
set -e
test "$status" -eq 1
set +e
./build/rea-rg --color never --sort path '[' . > "$tmp/out" 2> "$tmp/err"
status=$?
set -e
test "$status" -eq 2
printf '[PASS] 7 local behavior checks; see differential.py for receipt comparisons\n'
