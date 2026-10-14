#!/bin/sh
set -eu
cd "$(dirname "$0")"
mkdir -p build
swiftc -O -module-cache-path build/module-cache -o build/imgviewmac main.swift -framework Cocoa
