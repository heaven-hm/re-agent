#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${CXX:=clang++}"
mkdir -p build
"$CXX" -std=c++17 -O2 -Wall -Wextra -pedantic rea-rg.cpp -o build/rea-rg
file build/rea-rg
