#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${SWIFTC:=swiftc}"
"$SWIFTC" -O -module-cache-path "$output_dir/module-cache" \
  -o "$output_dir/clipjarmac" "$script_dir/main.swift" \
  -framework Cocoa -framework CryptoKit -lsqlite3
file "$output_dir/clipjarmac"
