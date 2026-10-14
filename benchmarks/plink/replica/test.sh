#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$script_dir/build.sh"
python3 "$script_dir/test.py" "$script_dir/build/plinkmac"
