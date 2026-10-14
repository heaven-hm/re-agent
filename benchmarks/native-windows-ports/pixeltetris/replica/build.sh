#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${CC:=clang}"
pkg-config --exists sdl2 SDL2_image SDL2_ttf || {
  echo "Missing SDL2, SDL2_image, or SDL2_ttf pkg-config package" >&2
  exit 1
}
"$CC" -std=c11 -O2 -Wall -Wextra \
  $(pkg-config --cflags sdl2 SDL2_image SDL2_ttf) \
  "$script_dir/pixelmac.c" \
  $(pkg-config --libs sdl2 SDL2_image SDL2_ttf) \
  -o "$output_dir/pixelmac"
file "$output_dir/pixelmac"
