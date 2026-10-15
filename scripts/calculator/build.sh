#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${SWIFTC:=swiftc}"
"$SWIFTC" -O -module-cache-path "$output_dir/module-cache" \
  -o "$output_dir/calculatormac" \
  "$script_dir/CalculatorEngine.swift" \
  "$script_dir/CalculatorWindow.swift" \
  "$script_dir/CalculatorApp.swift" \
  -framework Cocoa
file "$output_dir/calculatormac"
