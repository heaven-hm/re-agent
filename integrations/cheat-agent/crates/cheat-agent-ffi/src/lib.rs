pub mod sys;

use cheat_agent_core::{
    CheatError, DataType, MemoryRegion, ModuleInfo, PointerChain, Result, ScanMode,
};
use std::ffi::{CStr, CString};
use std::ptr;

pub struct ProcessBackend {
    raw: *mut sys::CheatProcessBackend,
}

unsafe impl Send for ProcessBackend {}
unsafe impl Sync for ProcessBackend {}

impl ProcessBackend {
    pub fn new(pid: u32) -> Result<Self> {
        let mut raw = ptr::null_mut();
        let status = unsafe { sys::cheat_backend_create(pid, &mut raw) };
        if status != 0 || raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        Ok(Self { raw })
    }

    pub fn is_alive(&self) -> bool {
        if self.raw.is_null() {
            return false;
        }
        unsafe { sys::cheat_backend_is_alive(self.raw) != 0 }
    }

    pub fn get_pid(&self) -> u32 {
        if self.raw.is_null() {
            return 0;
        }
        unsafe { sys::cheat_backend_get_pid(self.raw) }
    }

    pub fn read_memory(&self, address: u64, size: usize) -> Result<Vec<u8>> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut buffer = vec![0u8; size];
        let mut bytes_read = 0;
        let status = unsafe {
            sys::cheat_backend_read_memory(
                self.raw,
                address,
                buffer.as_mut_ptr() as *mut _,
                size,
                &mut bytes_read,
            )
        };
        if status != 0 {
            return Err(CheatError::ReadFailed {
                address,
                message: format!("status code {}", status),
            });
        }
        buffer.truncate(bytes_read);
        Ok(buffer)
    }

    pub fn write_memory(&self, address: u64, data: &[u8]) -> Result<usize> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut bytes_written = 0;
        let status = unsafe {
            sys::cheat_backend_write_memory(
                self.raw,
                address,
                data.as_ptr() as *const _,
                data.len(),
                &mut bytes_written,
            )
        };
        if status != 0 {
            return Err(CheatError::WriteFailed {
                address,
                message: format!("status code {}", status),
            });
        }
        Ok(bytes_written)
    }

    pub fn query_regions(&self) -> Result<Vec<MemoryRegion>> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        const MAX_REGIONS: usize = 4096;
        let mut raw_regions = vec![
            sys::CheatMemoryRegion {
                base_address: 0,
                size: 0,
                protection: 0,
                is_writable: 0,
                is_executable: 0,
            };
            MAX_REGIONS
        ];
        let mut count = 0;
        let status = unsafe {
            sys::cheat_backend_query_regions(
                self.raw,
                raw_regions.as_mut_ptr(),
                MAX_REGIONS,
                &mut count,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "query_regions failed with {}",
                status
            )));
        }

        let mut out = Vec::with_capacity(count);
        for r in &raw_regions[..count] {
            out.push(MemoryRegion {
                base_address: r.base_address,
                size: r.size,
                protection: r.protection,
                is_writable: r.is_writable != 0,
                is_executable: r.is_executable != 0,
            });
        }
        Ok(out)
    }

    pub fn query_modules(&self) -> Result<Vec<ModuleInfo>> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        const MAX_MODS: usize = 256;
        let mut raw_mods = vec![
            sys::CheatModuleInfo {
                name: [0; 256],
                path: [0; 1024],
                base_address: 0,
                size: 0,
            };
            MAX_MODS
        ];
        let mut count = 0;
        let status = unsafe {
            sys::cheat_backend_query_modules(
                self.raw,
                raw_mods.as_mut_ptr(),
                MAX_MODS,
                &mut count,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "query_modules failed with {}",
                status
            )));
        }

        let mut out = Vec::with_capacity(count);
        for m in &raw_mods[..count] {
            let name_str = CStr::from_bytes_until_nul(&m.name)
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let path_str = CStr::from_bytes_until_nul(&m.path)
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            out.push(ModuleInfo {
                name: name_str,
                path: path_str,
                base_address: m.base_address,
                size: m.size,
            });
        }
        Ok(out)
    }

    pub fn resolve_pointer(&self, chain: &PointerChain) -> Result<u64> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut raw_chain = sys::CheatPointerChain {
            base_module: [0; 256],
            base_offset: chain.base_offset,
            offsets: [0; 16],
            offset_count: chain.offsets.len().min(16),
        };
        let c_mod = CString::new(chain.base_module.as_str()).map_err(|e| {
            CheatError::InvalidArgument(format!("null byte in module name: {}", e))
        })?;
        let bytes = c_mod.as_bytes_with_nul();
        let copy_len = bytes.len().min(256);
        raw_chain.base_module[..copy_len].copy_from_slice(&bytes[..copy_len]);

        for (i, off) in chain.offsets.iter().take(16).enumerate() {
            raw_chain.offsets[i] = *off;
        }

        let mut out_address = 0;
        let status =
            unsafe { sys::cheat_pointer_resolve(self.raw, &raw_chain, &mut out_address) };
        if status != 0 {
            return Err(CheatError::NotFound(format!(
                "pointer chain resolution failed with status {}",
                status
            )));
        }
        Ok(out_address)
    }

    pub fn scan_pointers(
        &self,
        target_address: u64,
        max_depth: usize,
        max_offset: i64,
        max_chains: usize,
    ) -> Result<Vec<PointerChain>> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut raw_chains = vec![
            sys::CheatPointerChain {
                base_module: [0; 256],
                base_offset: 0,
                offsets: [0; 16],
                offset_count: 0,
            };
            max_chains
        ];
        let mut count = 0;
        let status = unsafe {
            sys::cheat_pointer_scan(
                self.raw,
                target_address,
                max_depth,
                max_offset,
                raw_chains.as_mut_ptr(),
                max_chains,
                &mut count,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "pointer scan failed with {}",
                status
            )));
        }

        let mut out = Vec::with_capacity(count);
        for c in &raw_chains[..count] {
            let mod_name = CStr::from_bytes_until_nul(&c.base_module)
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let mut offsets = Vec::new();
            for i in 0..c.offset_count.min(16) {
                offsets.push(c.offsets[i]);
            }
            out.push(PointerChain {
                base_module: mod_name,
                base_offset: c.base_offset,
                offsets,
            });
        }
        Ok(out)
    }
}

impl Drop for ProcessBackend {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe {
                sys::cheat_backend_destroy(self.raw);
            }
            self.raw = ptr::null_mut();
        }
    }
}

pub struct MemoryScanner {
    raw: *mut sys::CheatMemoryScanner,
    data_size: usize,
}

unsafe impl Send for MemoryScanner {}
unsafe impl Sync for MemoryScanner {}

impl MemoryScanner {
    pub fn new(backend: &ProcessBackend) -> Result<Self> {
        if backend.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut raw = ptr::null_mut();
        let status = unsafe { sys::cheat_scanner_create(backend.raw, &mut raw) };
        if status != 0 || raw.is_null() {
            return Err(CheatError::Internal(format!(
                "scanner creation failed with {}",
                status
            )));
        }
        Ok(Self { raw, data_size: 0 })
    }

    pub fn reset(&mut self) -> Result<()> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let status = unsafe { sys::cheat_scanner_reset(self.raw) };
        if status != 0 {
            return Err(CheatError::Internal("scanner reset failed".to_string()));
        }
        self.data_size = 0;
        Ok(())
    }

    pub fn first_scan(
        &mut self,
        data_type: DataType,
        mode: ScanMode,
        val1: Option<&[u8]>,
        val2: Option<&[u8]>,
    ) -> Result<()> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let size = match data_type {
            DataType::ByteArray | DataType::String => val1.or(val2).map_or(0, |v| v.len()),
            _ => data_type.byte_size(),
        };
        if size == 0 || size > 4 * 1024 ||
            val1.is_some_and(|v| v.len() != size) ||
            val2.is_some_and(|v| v.len() != size) {
            return Err(CheatError::InvalidArgument("scan values must match the declared data width".into()));
        }
        let p1 = val1.map_or(ptr::null(), |b| b.as_ptr() as *const _);
        let p2 = val2.map_or(ptr::null(), |b| b.as_ptr() as *const _);

        let status = unsafe {
            sys::cheat_scanner_first_scan(
                self.raw,
                data_type as i32,
                mode as i32,
                p1,
                p2,
                size,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "first_scan failed with code {}",
                status
            )));
        }
        self.data_size = size;
        Ok(())
    }

    pub fn next_scan(
        &mut self,
        mode: ScanMode,
        val1: Option<&[u8]>,
        val2: Option<&[u8]>,
    ) -> Result<()> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        if self.data_size == 0 ||
            val1.is_some_and(|v| v.len() != self.data_size) ||
            val2.is_some_and(|v| v.len() != self.data_size) {
            return Err(CheatError::InvalidArgument("next scan value length must match first scan".into()));
        }
        let p1 = val1.map_or(ptr::null(), |b| b.as_ptr() as *const _);
        let p2 = val2.map_or(ptr::null(), |b| b.as_ptr() as *const _);
        let size = self.data_size;

        let status = unsafe {
            sys::cheat_scanner_next_scan(
                self.raw,
                mode as i32,
                p1,
                p2,
                size,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "next_scan failed with code {}",
                status
            )));
        }
        Ok(())
    }

    pub fn scan_aob(&mut self, pattern: &str) -> Result<()> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let c_pat = CString::new(pattern).map_err(|e| {
            CheatError::InvalidArgument(format!("null byte in pattern: {}", e))
        })?;
        let status = unsafe { sys::cheat_scanner_scan_aob(self.raw, c_pat.as_ptr()) };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "scan_aob failed with code {}",
                status
            )));
        }
        Ok(())
    }

    pub fn match_count(&self) -> usize {
        if self.raw.is_null() {
            return 0;
        }
        unsafe { sys::cheat_scanner_get_match_count(self.raw) }
    }

    pub fn get_matches(&self, max_count: usize) -> Result<Vec<u64>> {
        if self.raw.is_null() {
            return Err(CheatError::NotConnected);
        }
        let mut buffer = vec![0u64; max_count];
        let mut count = 0;
        let status = unsafe {
            sys::cheat_scanner_get_matches(
                self.raw,
                buffer.as_mut_ptr(),
                max_count,
                &mut count,
            )
        };
        if status != 0 {
            return Err(CheatError::Internal(format!(
                "get_matches failed with code {}",
                status
            )));
        }
        buffer.truncate(count);
        Ok(buffer)
    }
}

impl Drop for MemoryScanner {
    fn drop(&mut self) {
        if !self.raw.is_null() {
            unsafe {
                sys::cheat_scanner_destroy(self.raw);
            }
            self.raw = ptr::null_mut();
        }
    }
}
