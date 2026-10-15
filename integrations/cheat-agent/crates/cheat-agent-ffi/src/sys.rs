use std::ffi::c_void;

#[repr(C)]
pub struct CheatProcessBackend {
    _private: [u8; 0],
}

#[repr(C)]
pub struct CheatMemoryScanner {
    _private: [u8; 0],
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct CheatMemoryRegion {
    pub base_address: u64,
    pub size: u64,
    pub protection: u32,
    pub is_writable: u32,
    pub is_executable: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct CheatModuleInfo {
    pub name: [u8; 256],
    pub path: [u8; 1024],
    pub base_address: u64,
    pub size: u64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct CheatPointerChain {
    pub base_module: [u8; 256],
    pub base_offset: u64,
    pub offsets: [i64; 16],
    pub offset_count: usize,
}

extern "C" {
    pub fn cheat_backend_create(pid: u32, out_backend: *mut *mut CheatProcessBackend) -> i32;
    pub fn cheat_backend_destroy(backend: *mut CheatProcessBackend);
    pub fn cheat_backend_is_alive(backend: *mut CheatProcessBackend) -> i32;
    pub fn cheat_backend_get_pid(backend: *mut CheatProcessBackend) -> u32;
    pub fn cheat_backend_read_memory(backend: *mut CheatProcessBackend, address: u64, buffer: *mut c_void, size: usize, bytes_read: *mut usize) -> i32;
    pub fn cheat_backend_write_memory(backend: *mut CheatProcessBackend, address: u64, buffer: *const c_void, size: usize, bytes_written: *mut usize) -> i32;
    pub fn cheat_backend_query_regions(backend: *mut CheatProcessBackend, out_regions: *mut CheatMemoryRegion, max_regions: usize, count: *mut usize) -> i32;
    pub fn cheat_backend_query_modules(backend: *mut CheatProcessBackend, out_modules: *mut CheatModuleInfo, max_modules: usize, count: *mut usize) -> i32;

    pub fn cheat_scanner_create(backend: *mut CheatProcessBackend, out_scanner: *mut *mut CheatMemoryScanner) -> i32;
    pub fn cheat_scanner_destroy(scanner: *mut CheatMemoryScanner);
    pub fn cheat_scanner_reset(scanner: *mut CheatMemoryScanner) -> i32;
    pub fn cheat_scanner_first_scan(scanner: *mut CheatMemoryScanner, data_type: i32, scan_mode: i32, value1: *const c_void, value2: *const c_void, value_size: usize) -> i32;
    pub fn cheat_scanner_next_scan(scanner: *mut CheatMemoryScanner, scan_mode: i32, value1: *const c_void, value2: *const c_void, value_size: usize) -> i32;
    pub fn cheat_scanner_scan_aob(scanner: *mut CheatMemoryScanner, pattern: *const std::os::raw::c_char) -> i32;
    pub fn cheat_scanner_get_match_count(scanner: *mut CheatMemoryScanner) -> usize;
    pub fn cheat_scanner_get_matches(scanner: *mut CheatMemoryScanner, out_addresses: *mut u64, max_count: usize, count: *mut usize) -> i32;

    pub fn cheat_pointer_resolve(backend: *mut CheatProcessBackend, chain: *const CheatPointerChain, out_address: *mut u64) -> i32;
    pub fn cheat_pointer_scan(backend: *mut CheatProcessBackend, target_address: u64, max_depth: usize, max_offset: i64, out_chains: *mut CheatPointerChain, max_chains: usize, found_count: *mut usize) -> i32;
}
