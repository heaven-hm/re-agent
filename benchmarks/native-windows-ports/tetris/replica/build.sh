#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
output_dir="$script_dir/build"
mkdir -p "$output_dir"
: "${CC:=clang}"
pkg-config --exists sdl2 SDL2_image SDL2_ttf SDL2_mixer || {
  echo "Missing SDL2, SDL2_image, SDL2_ttf, or SDL2_mixer pkg-config package" >&2
  exit 1
}
"$CC" -std=c11 -O2 -Wall -Wextra \
  $(pkg-config --cflags sdl2 SDL2_image SDL2_ttf SDL2_mixer) \
  "$script_dir/tetris.c" \
  $(pkg-config --libs sdl2 SDL2_image SDL2_ttf SDL2_mixer) \
  -o "$output_dir/tetrismac"
file "$output_dir/tetrismac"
