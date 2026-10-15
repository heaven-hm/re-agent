#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${CC:=clang}"
"$CC" -std=c11 -O2 -Wall -Wextra -pedantic \
  "$script_dir/qvmtool.c" -o "$output_dir/qvmtool"
file "$output_dir/qvmtool"
