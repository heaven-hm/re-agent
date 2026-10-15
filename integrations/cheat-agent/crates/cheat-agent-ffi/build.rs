use std::env;

fn main() {
    println!("cargo:rerun-if-changed=../../native/include/cheat_agent.h");
    println!("cargo:rerun-if-changed=../../native/src/ffi.cpp");
    println!("cargo:rerun-if-changed=../../native/src/memory_scanner.cpp");
    println!("cargo:rerun-if-changed=../../native/src/pattern_scanner.cpp");
    println!("cargo:rerun-if-changed=../../native/src/pointer_resolver.cpp");

    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    let mut build = cc::Build::new();
    build.cpp(true);
    build.std("c++20");
    build.include("../../native/include");

    build.file("../../native/src/pattern_scanner.cpp");
    build.file("../../native/src/memory_scanner.cpp");
    build.file("../../native/src/pointer_resolver.cpp");
    build.file("../../native/src/ffi.cpp");

    if target_os == "macos" {
        build.file("../../native/src/macos/process_backend.cpp");
    } else if target_os == "windows" {
        build.file("../../native/src/windows/process_backend.cpp");
    } else {
        build.file("../../native/src/linux/process_backend.cpp");
    }

    build.compile("cheat_agent_native");
}
