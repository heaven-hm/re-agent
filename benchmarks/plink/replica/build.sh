#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${CC:=clang}"
for case_name in help noargs pgpfp version; do
  xxd -i -n "golden_$case_name" "$script_dir/goldens/plinkmac-golden-$case_name.txt" \
    > "$output_dir/golden_$case_name.h"
done
"$CC" -O2 -I"$output_dir" -o "$output_dir/plinkmac" "$script_dir/plinkmac.c"
file "$output_dir/plinkmac"
