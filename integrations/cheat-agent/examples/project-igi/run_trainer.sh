#!/usr/bin/env bash
# ==============================================================================
# Project IGI - Standalone Trainer Launcher for macOS / CrossOver
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

BOTTLE_NAME="project-igi"
WINE_BIN="/Users/haseeb-mir/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine"
BOTTLE_DIR="/Users/haseeb-mir/Library/Application Support/CrossOver/Bottles/${BOTTLE_NAME}"
TRAINER_EXE="${BOTTLE_DIR}/drive_c/IGI/gtlibcpp_live_trainer.exe"
GTLIBCPP_ROOT="$(cd "${REPO_ROOT}/../gtlibcpp" && pwd)"

# If trainer exe does not exist in bottle, build and copy it from GTLibCpp
if [ ! -f "${TRAINER_EXE}" ]; then
    echo "[+] Compiling gtlibcpp_live_trainer.exe for Win32 using GTLibCpp..."
    /opt/homebrew/bin/i686-w64-mingw32-g++ -std=c++17 -static -O2 \
        -I"${GTLIBCPP_ROOT}/include" -I"${GTLIBCPP_ROOT}/examples" \
        "${GTLIBCPP_ROOT}/examples/gtlibcpp_live_trainer.cpp" \
        "${GTLIBCPP_ROOT}/src/windows_backend.cpp" \
        "${GTLIBCPP_ROOT}/src/freeze.cpp" \
        -o "${TRAINER_EXE}" -lpsapi -lbcrypt
fi

echo "[+] Launching GTLibCpp Live Trainer inside CrossOver bottle '${BOTTLE_NAME}'..."
"${WINE_BIN}" --bottle "${BOTTLE_NAME}" "C:\\IGI\\gtlibcpp_live_trainer.exe" "$@"
