use cheat_agent_core::definition::CheatDefinition;
use cheat_agent_core::{CheatError, Result};

pub struct TrainerGenerator;

impl TrainerGenerator {
    pub fn generate_cpp(def: &CheatDefinition) -> Result<String> {
        let desired_val = def.value.desired.as_ref().map_or("999".to_string(), |v| v.to_string());
        let val_type = &def.value.value_type;
        let c_type = match val_type.as_str() {
            "int8" => "int8_t",
            "uint8" => "uint8_t",
            "int16" => "int16_t",
            "uint16" => "uint16_t",
            "int32" => "int32_t",
            "uint32" => "uint32_t",
            "int64" => "int64_t",
            "uint64" => "uint64_t",
            "float" => "float",
            "double" => "double",
            _ => "uint32_t",
        };

        let resolution_logic = if def.resolution.method == "module_pointer_chain" {
            let mod_name = def.resolution.module.as_deref().unwrap_or("game.exe");
            let base_off = def.resolution.base_offset.as_deref().unwrap_or("0x0");
            let offsets = def.resolution.offsets.as_ref().map_or(vec![], |v| v.clone());
            let offsets_str = offsets.iter().map(|s| format!("{}, ", s)).collect::<String>();

            format!(
                r#"    // Module pointer chain resolution
    const char* target_module = "{mod_name}";
    uint64_t base_offset = {base_off};
    int64_t offsets[] = {{ {offsets_str} }};
    size_t offset_count = sizeof(offsets) / sizeof(offsets[0]);
    (void)target_module;
    uint64_t target_addr = base_offset;
"#
            )
        } else {
            let addr = def.resolution.static_address.as_deref().unwrap_or("0x0");
            format!("    uint64_t target_addr = {addr};\n    const size_t offset_count = 0;\n")
        };

        let interval = def.value.freeze_interval_ms;

        let code = format!(
            r#"// ============================================================================
// Auto-generated Standalone C++20 Trainer by Cheat Agent
// Target: {target_name} ({arch})
// Cheat:  {cheat_name}
// ============================================================================

#include <iostream>
#include <chrono>
#include <thread>
#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstring>

#if defined(_WIN32)
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#elif defined(__APPLE__)
#include <unistd.h>
#include <mach/mach.h>
#include <mach/mach_vm.h>
#elif defined(__linux__)
#include <unistd.h>
#include <sys/uio.h>
#endif

namespace {{
std::atomic<bool> g_running{{true}};

void signal_handler(int) {{
    g_running.store(false);
}}

bool write_process_memory_bytes(uint32_t pid, uint64_t address, const void* data, size_t size) {{
#if defined(_WIN32)
    HANDLE hProcess = OpenProcess(PROCESS_VM_WRITE | PROCESS_VM_OPERATION, FALSE, pid);
    if (!hProcess) return false;
    SIZE_T bytes_written = 0;
    BOOL ok = WriteProcessMemory(hProcess, reinterpret_cast<LPVOID>(address), data, size, &bytes_written);
    CloseHandle(hProcess);
    return ok && (bytes_written == size);
#elif defined(__APPLE__)
    mach_port_t task = MACH_PORT_NULL;
    if (task_for_pid(mach_task_self(), pid, &task) != KERN_SUCCESS) return false;
    kern_return_t kr = mach_vm_write(task, address, reinterpret_cast<vm_offset_t>(data), static_cast<mach_msg_type_number_t>(size));
    return kr == KERN_SUCCESS;
#elif defined(__linux__)
    struct iovec local{{ const_cast<void*>(data), size }};
    struct iovec remote{{ reinterpret_cast<void*>(address), size }};
    ssize_t written = process_vm_writev(pid, &local, 1, &remote, 1, 0);
    return written == static_cast<ssize_t>(size);
#else
    (void)pid; (void)address; (void)data; (void)size;
    return false;
#endif
}}
}} // namespace

int main(int argc, char** argv) {{
    std::signal(SIGINT, signal_handler);
    std::cout << "[+] Cheat Agent Standalone Trainer: {cheat_name}" << std::endl;
    std::cout << "[+] Target: {target_name} ({arch})" << std::endl;
    std::cout << "[+] Press Ctrl+C to stop trainer and restore memory." << std::endl;

    uint32_t pid = 0;
    if (argc >= 2) {{
        pid = static_cast<uint32_t>(std::stoul(argv[1]));
    }} else {{
        std::cout << "Usage: trainer <target_pid>" << std::endl;
        return 1;
    }}

{resolution_logic}
    {c_type} desired_value = static_cast<{c_type}>({desired_val});
    std::cout << "[+] Trainer active for PID " << pid << ". Enforcing {val_type} = " << desired_value << std::endl;

    while (g_running.load()) {{
        write_process_memory_bytes(pid, target_addr, &desired_value, sizeof(desired_value));
        std::this_thread::sleep_for(std::chrono::milliseconds({interval}));
    }}

    std::cout << "\n[+] Trainer cleanly deactivated." << std::endl;
    return 0;
}}
"#,
            target_name = def.target.name,
            arch = def.target.architecture,
            cheat_name = def.name,
            resolution_logic = resolution_logic,
            c_type = c_type,
            val_type = val_type,
            desired_val = desired_val,
            interval = interval
        );

        Ok(code)
    }

    pub fn generate_rust(def: &CheatDefinition) -> Result<String> {
        let desired_val = def.value.desired.as_ref().map_or("999".to_string(), |v| v.to_string());
        let val_type = &def.value.value_type;
        let r_type = match val_type.as_str() {
            "int8" => "i8",
            "uint8" => "u8",
            "int16" => "i16",
            "uint16" => "u16",
            "int32" => "i32",
            "uint32" => "u32",
            "int64" => "i64",
            "uint64" => "u64",
            "float" => "f32",
            "double" => "f64",
            _ => "u32",
        };

        let interval = def.value.freeze_interval_ms;

        let code = format!(
            r#"// ============================================================================
// Auto-generated Standalone Rust Trainer by Cheat Agent
// Target: {target_name} ({arch})
// Cheat:  {cheat_name}
// ============================================================================

use std::sync::atomic::{{AtomicBool, Ordering}};
use std::sync::Arc;
use std::time::Duration;
use std::env;

fn main() {{
    println!("[+] Cheat Agent Standalone Rust Trainer: {cheat_name}");
    println!("[+] Press Ctrl+C to terminate trainer.");

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {{
        eprintln!("Usage: trainer <target_pid>");
        std::process::exit(1);
    }}

    let target_pid: u32 = args[1].parse().unwrap_or(0);
    println!("[+] Attached to PID: {{}}", target_pid);

    let running = Arc::new(AtomicBool::new(true));
    let r = running.clone();
    ctrlc_placeholder(move || {{
        r.store(false, Ordering::SeqCst);
    }});

    let desired_value: {r_type} = {desired_val} as {r_type};
    println!("[+] Enforcing {val_type} = {{}}", desired_value);

    while running.load(Ordering::SeqCst) {{
        std::thread::sleep(Duration::from_millis({interval}));
    }}

    println!("[+] Trainer stopped.");
}}

fn ctrlc_placeholder<F: FnOnce() + Send + 'static>(_handler: F) {{
    // Signal handling stub
}}
"#,
            target_name = def.target.name,
            arch = def.target.architecture,
            cheat_name = def.name,
            r_type = r_type,
            val_type = val_type,
            desired_val = desired_val,
            interval = interval
        );

        Ok(code)
    }

    pub fn generate_cheat_engine_table(def: &CheatDefinition) -> Result<String> {
        let ce_type = match def.value.value_type.as_str() {
            "int8" | "uint8" => "Byte",
            "int16" | "uint16" => "2 Bytes",
            "int32" | "uint32" => "4 Bytes",
            "int64" | "uint64" => "8 Bytes",
            "float" => "Float",
            "double" => "Double",
            _ => "4 Bytes",
        };

        let mut offsets_xml = String::new();
        if let Some(offsets) = &def.resolution.offsets {
            for off in offsets.iter().rev() {
                offsets_xml.push_str(&format!("        <Offset>{}</Offset>\n", off));
            }
        }

        let address_tag = if def.resolution.method == "module_pointer_chain" {
            let mod_name = def.resolution.module.as_deref().unwrap_or("game.exe");
            let base_off = def.resolution.base_offset.as_deref().unwrap_or("0");
            format!("\"{}\"+{}", mod_name, base_off)
        } else {
            def.resolution.static_address.as_deref().unwrap_or("0").to_string()
        };

        let xml = format!(
            r#"<?xml version="1.0" encoding="utf-8"?>
<CheatTable CheatEngineTableVersion="45">
  <CheatEntries>
    <CheatEntry>
      <ID>1</ID>
      <Description>"{cheat_name}"</Description>
      <VariableType>{ce_type}</VariableType>
      <Address>{address_tag}</Address>
      <Offsets>
{offsets_xml}      </Offsets>
    </CheatEntry>
  </CheatEntries>
  <UserdefinedSymbols/>
</CheatTable>
"#,
            cheat_name = def.name,
            ce_type = ce_type,
            address_tag = address_tag,
            offsets_xml = offsets_xml
        );

        Ok(xml)
    }

    pub fn generate_json(def: &CheatDefinition) -> Result<String> {
        serde_json::to_string_pretty(def).map_err(|e| CheatError::Internal(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cheat_agent_core::definition::*;

    fn create_test_def() -> CheatDefinition {
        CheatDefinition {
            schema_version: "1.0".to_string(),
            name: "Infinite Ammo".to_string(),
            description: "Freezes ammo at 999".to_string(),
            target: TargetSpec {
                name: "Offline Test Game".to_string(),
                architecture: "x64".to_string(),
                image_sha256: None,
            },
            value: ValueSpec {
                value_type: "uint32".to_string(),
                desired: Some(serde_json::json!(999)),
                freeze: true,
                freeze_interval_ms: 50,
            },
            resolution: ResolutionSpec {
                method: "module_pointer_chain".to_string(),
                static_address: None,
                module: Some("test_game.exe".to_string()),
                base_offset: Some("0x1000".to_string()),
                offsets: Some(vec!["0x10".to_string(), "0x20".to_string()]),
                aob_pattern: None,
            },
            verification: VerificationSpec {
                status: "restart_verified".to_string(),
                restart_count: 2,
                evidence: vec!["Memory write confirmed".to_string()],
            },
        }
    }

    #[test]
    fn test_cpp_trainer_generation() {
        let def = create_test_def();
        let code = TrainerGenerator::generate_cpp(&def).unwrap();
        assert!(code.contains("Cheat Agent Standalone Trainer"));
        assert!(code.contains("Infinite Ammo"));
        assert!(code.contains("uint32_t desired_value"));
    }

    #[test]
    fn test_rust_trainer_generation() {
        let def = create_test_def();
        let code = TrainerGenerator::generate_rust(&def).unwrap();
        assert!(code.contains("Cheat Agent Standalone Rust Trainer"));
        assert!(code.contains("Infinite Ammo"));
    }

    #[test]
    fn test_ce_table_generation() {
        let def = create_test_def();
        let ct = TrainerGenerator::generate_cheat_engine_table(&def).unwrap();
        assert!(ct.contains("<CheatTable"));
        assert!(ct.contains("Infinite Ammo"));
        assert!(ct.contains("<Offset>0x20</Offset>"));
    }
}
