#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/../../../.." && pwd)
output_dir="$repo_root/benchmarks/native-batch-2/reconstructed/fd/build"
mkdir -p "$output_dir"
: "${CXX:=clang++}"
"$CXX" -std=c++17 -O2 -Wall -Wextra -pedantic \
  "$script_dir/fdmac.cpp" -o "$output_dir/fdmac"
file "$output_dir/fdmac"
