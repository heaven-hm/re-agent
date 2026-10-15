use cheat_agent_core::{CheatError, DataType, Result, ScanMode};
use cheat_agent_ffi::{MemoryScanner, ProcessBackend};
use cheat_agent_generators::TrainerGenerator;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

pub struct McpServer {
    backend: Arc<Mutex<Option<ProcessBackend>>>,
    scanner: Arc<Mutex<Option<MemoryScanner>>>,
}

impl McpServer {
    pub fn new() -> Self {
        Self {
            backend: Arc::new(Mutex::new(None)),
            scanner: Arc::new(Mutex::new(None)),
        }
    }

    pub fn get_tools_list() -> Value {
        json!([
            {
                "name": "process_attach",
                "description": "Attaches to target game process by PID and initializes scanning session",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pid": { "type": "integer", "description": "Target Process ID" }
                    },
                    "required": ["pid"]
                }
            },
            {
                "name": "process_inspect",
                "description": "Inspects attached process status, modules, and memory regions",
                "inputSchema": {
                    "type": "object"
                }
            },
            {
                "name": "memory_read",
                "description": "Reads memory bytes or typed data from an address",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "address": { "type": "string", "description": "Hexadecimal address, e.g. 0x140001000" },
                        "size": { "type": "integer", "description": "Number of bytes to read" }
                    },
                    "required": ["address", "size"]
                }
            },
            {
                "name": "memory_scan_exact",
                "description": "Performs exact value scan across process memory",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "type": { "type": "string", "enum": ["uint8", "uint16", "uint32", "uint64", "float", "double"] },
                        "value": { "type": "number", "description": "Numeric target value" },
                        "is_first_scan": { "type": "boolean", "default": true }
                    },
                    "required": ["type", "value"]
                }
            },
            {
                "name": "memory_scan_changed",
                "description": "Refines memory candidates by finding addresses whose value has changed",
                "inputSchema": {
                    "type": "object"
                }
            },
            {
                "name": "memory_scan_decreased",
                "description": "Refines memory candidates by finding addresses whose value decreased (e.g. ammo fired, health lost)",
                "inputSchema": {
                    "type": "object"
                }
            },
            {
                "name": "memory_scan_increased",
                "description": "Refines memory candidates by finding addresses whose value increased",
                "inputSchema": {
                    "type": "object"
                }
            },
            {
                "name": "memory_scan_aob",
                "description": "Scans memory for an Array of Bytes signature with ? wildcards",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string", "description": "e.g. 48 8B 05 ? ? ? ? 48 85 C0" }
                    },
                    "required": ["pattern"]
                }
            },
            {
                "name": "pointer_scan",
                "description": "Finds module-relative pointer chains leading to a target address",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "target_address": { "type": "string", "description": "Hex target address" },
                        "max_depth": { "type": "integer", "default": 2 },
                        "max_offset": { "type": "integer", "default": 4096 }
                    },
                    "required": ["target_address"]
                }
            },
            {
                "name": "trainer_generate",
                "description": "Generates C++20, Rust, and Cheat Engine .CT trainer source code from a verified cheat definition",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "cheat_json": { "type": "string", "description": "Serialized CheatDefinition JSON" },
                        "language": { "type": "string", "enum": ["cpp", "rust", "cheat_engine"] }
                    },
                    "required": ["cheat_json", "language"]
                }
            }
        ])
    }

    pub fn handle_tool_call(&self, name: &str, arguments: &Value) -> Result<Value> {
        match name {
            "process_attach" => {
                let pid = arguments["pid"].as_u64().ok_or_else(|| {
                    CheatError::InvalidArgument("missing pid".to_string())
                })? as u32;

                let backend = ProcessBackend::new(pid)?;
                let scanner = MemoryScanner::new(&backend)?;

                *self.backend.lock().unwrap() = Some(backend);
                *self.scanner.lock().unwrap() = Some(scanner);

                Ok(json!({
                    "status": "attached",
                    "pid": pid,
                    "message": format!("Successfully attached to process {}", pid)
                }))
            }
            "process_inspect" => {
                let guard = self.backend.lock().unwrap();
                let backend = guard.as_ref().ok_or(CheatError::NotConnected)?;
                let regions = backend.query_regions()?;
                let modules = backend.query_modules()?;
                Ok(json!({
                    "pid": backend.get_pid(),
                    "alive": backend.is_alive(),
                    "region_count": regions.len(),
                    "modules": modules
                }))
            }
            "memory_read" => {
                let addr_str = arguments["address"].as_str().unwrap_or("0x0");
                let address = u64::from_str_radix(addr_str.trim_start_matches("0x"), 16)
                    .map_err(|e| CheatError::InvalidArgument(e.to_string()))?;
                let size = arguments["size"].as_u64().unwrap_or(4) as usize;

                let guard = self.backend.lock().unwrap();
                let backend = guard.as_ref().ok_or(CheatError::NotConnected)?;
                let bytes = backend.read_memory(address, size)?;

                Ok(json!({
                    "address": format!("0x{:X}", address),
                    "bytes_hex": bytes.iter().map(|b| format!("{:02X}", b)).collect::<Vec<_>>().join(" "),
                    "bytes": bytes
                }))
            }
            "memory_scan_exact" => {
                let type_str = arguments["type"].as_str().unwrap_or("uint32");
                let is_first = arguments["is_first_scan"].as_bool().unwrap_or(true);

                let data_type = match type_str {
                    "uint8" => DataType::Uint8,
                    "uint16" => DataType::Uint16,
                    "uint32" => DataType::Uint32,
                    "uint64" => DataType::Uint64,
                    "float" => DataType::Float,
                    "double" => DataType::Double,
                    _ => return Err(CheatError::InvalidArgument("unsupported scan type".into())),
                };

                // Integer values must come from JSON integers to avoid losing
                // uint64 precision in the f64 conversion.
                let unsigned = || {
                    // JSON Schema allows a number; accept 42.0 / 1e3 when
                    // they are finite, integral and exactly representable.
                    // Native JSON integers retain full uint64 precision.
                    arguments["value"].as_u64().or_else(|| {
                        let n = arguments["value"].as_f64()?;
                        if n.is_finite() && n >= 0.0 && n.fract() == 0.0
                            && n <= (1u64 << 53) as f64 {
                            Some(n as u64)
                        } else {
                            None
                        }
                    }).ok_or_else(|| {
                        CheatError::InvalidArgument(
                            "unsigned scan value must be a nonnegative exact integer".into())
                    })
                };
                let val_bytes: Vec<u8> = match data_type {
                    DataType::Uint8 => u8::try_from(unsigned()?)
                        .map_err(|_| CheatError::InvalidArgument("uint8 value out of range".into()))?
                        .to_ne_bytes().to_vec(),
                    DataType::Uint16 => u16::try_from(unsigned()?)
                        .map_err(|_| CheatError::InvalidArgument("uint16 value out of range".into()))?
                        .to_ne_bytes().to_vec(),
                    DataType::Uint32 => u32::try_from(unsigned()?)
                        .map_err(|_| CheatError::InvalidArgument("uint32 value out of range".into()))?
                        .to_ne_bytes().to_vec(),
                    DataType::Uint64 => unsigned()?.to_ne_bytes().to_vec(),
                    DataType::Float | DataType::Double => {
                        let number = arguments["value"].as_f64().ok_or_else(|| {
                            CheatError::InvalidArgument("floating scan value must be numeric".into())
                        })?;
                        if !number.is_finite() {
                            return Err(CheatError::InvalidArgument("floating scan value must be finite".into()));
                        }
                        if data_type == DataType::Float {
                            if number.abs() > f32::MAX as f64 {
                                return Err(CheatError::InvalidArgument("float value out of range".into()));
                            }
                            (number as f32).to_ne_bytes().to_vec()
                        } else {
                            number.to_ne_bytes().to_vec()
                        }
                    }
                    _ => unreachable!(),
                };

                let mut guard = self.scanner.lock().unwrap();
                let scanner = guard.as_mut().ok_or(CheatError::NotConnected)?;

                if is_first {
                    scanner.first_scan(data_type, ScanMode::Exact, Some(&val_bytes), None)?;
                } else {
                    scanner.next_scan(ScanMode::Exact, Some(&val_bytes), None)?;
                }

                let count = scanner.match_count();
                let matches = scanner.get_matches(20)?;
                let matches_hex: Vec<String> = matches.iter().map(|a| format!("0x{:X}", a)).collect();

                Ok(json!({
                    "match_count": count,
                    "matches_sample": matches_hex
                }))
            }
            "memory_scan_decreased" => {
                let mut guard = self.scanner.lock().unwrap();
                let scanner = guard.as_mut().ok_or(CheatError::NotConnected)?;
                scanner.next_scan(ScanMode::Decreased, None, None)?;

                let count = scanner.match_count();
                let matches = scanner.get_matches(20)?;
                let matches_hex: Vec<String> = matches.iter().map(|a| format!("0x{:X}", a)).collect();

                Ok(json!({
                    "match_count": count,
                    "matches_sample": matches_hex
                }))
            }
            "memory_scan_increased" => {
                let mut guard = self.scanner.lock().unwrap();
                let scanner = guard.as_mut().ok_or(CheatError::NotConnected)?;
                scanner.next_scan(ScanMode::Increased, None, None)?;

                let count = scanner.match_count();
                let matches = scanner.get_matches(20)?;
                let matches_hex: Vec<String> = matches.iter().map(|a| format!("0x{:X}", a)).collect();

                Ok(json!({
                    "match_count": count,
                    "matches_sample": matches_hex
                }))
            }
            "memory_scan_changed" => {
                let mut guard = self.scanner.lock().unwrap();
                let scanner = guard.as_mut().ok_or(CheatError::NotConnected)?;
                scanner.next_scan(ScanMode::Changed, None, None)?;

                let count = scanner.match_count();
                let matches = scanner.get_matches(20)?;
                let matches_hex: Vec<String> = matches.iter().map(|a| format!("0x{:X}", a)).collect();

                Ok(json!({
                    "match_count": count,
                    "matches_sample": matches_hex
                }))
            }
            "memory_scan_aob" => {
                let pattern = arguments["pattern"].as_str().unwrap_or("");
                let mut guard = self.scanner.lock().unwrap();
                let scanner = guard.as_mut().ok_or(CheatError::NotConnected)?;
                scanner.scan_aob(pattern)?;

                let count = scanner.match_count();
                let matches = scanner.get_matches(20)?;
                let matches_hex: Vec<String> = matches.iter().map(|a| format!("0x{:X}", a)).collect();

                Ok(json!({
                    "match_count": count,
                    "matches_sample": matches_hex
                }))
            }
            "pointer_scan" => {
                let target_str = arguments["target_address"].as_str().unwrap_or("0x0");
                let target_addr = u64::from_str_radix(target_str.trim_start_matches("0x"), 16)
                    .map_err(|e| CheatError::InvalidArgument(e.to_string()))?;
                let max_depth = arguments["max_depth"].as_u64().unwrap_or(2) as usize;
                let max_offset = arguments["max_offset"].as_i64().unwrap_or(4096);

                let guard = self.backend.lock().unwrap();
                let backend = guard.as_ref().ok_or(CheatError::NotConnected)?;
                let chains = backend.scan_pointers(target_addr, max_depth, max_offset, 10)?;

                Ok(json!({
                    "found_count": chains.len(),
                    "chains": chains
                }))
            }
            "trainer_generate" => {
                let cheat_str = arguments["cheat_json"].as_str().unwrap_or("{}");
                let def: cheat_agent_core::definition::CheatDefinition = serde_json::from_str(cheat_str)
                    .map_err(|e| CheatError::InvalidArgument(format!("Invalid cheat json: {}", e)))?;
                let lang = arguments["language"].as_str().unwrap_or("cpp");

                let code = match lang {
                    "cpp" => TrainerGenerator::generate_cpp(&def)?,
                    "rust" => TrainerGenerator::generate_rust(&def)?,
                    "cheat_engine" => TrainerGenerator::generate_cheat_engine_table(&def)?,
                    _ => return Err(CheatError::InvalidArgument(format!("Unsupported language {}", lang))),
                };

                Ok(json!({
                    "language": lang,
                    "code": code
                }))
            }
            _ => Err(CheatError::NotFound(format!("Unknown tool {}", name))),
        }
    }

    pub fn run_stdio(&self) -> io::Result<()> {
        let stdin = io::stdin();
        let mut stdout = io::stdout();

        for line in stdin.lock().lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            let request: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(e) => {
                    let err_resp = json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": {
                            "code": -32700,
                            "message": format!("Parse error: {}", e)
                        }
                    });
                    writeln!(stdout, "{}", serde_json::to_string(&err_resp)?)?;
                    stdout.flush()?;
                    continue;
                }
            };

            let req_id = request.get("id").cloned().unwrap_or(Value::Null);
            let method = request["method"].as_str().unwrap_or("");

            let response = match method {
                "initialize" => {
                    json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {
                                "tools": {}
                            },
                            "serverInfo": {
                                "name": "cheat-agent-mcp",
                                "version": "0.1.0"
                            }
                        }
                    })
                }
                "tools/list" => {
                    json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "tools": Self::get_tools_list()
                        }
                    })
                }
                "tools/call" => {
                    let params = &request["params"];
                    let tool_name = params["name"].as_str().unwrap_or("");
                    let arguments = &params["arguments"];

                    match self.handle_tool_call(tool_name, arguments) {
                        Ok(res) => {
                            json!({
                                "jsonrpc": "2.0",
                                "id": req_id,
                                "result": {
                                    "content": [{
                                        "type": "text",
                                        "text": serde_json::to_string_pretty(&res).unwrap_or_default()
                                    }],
                                    "isError": false
                                }
                            })
                        }
                        Err(e) => {
                            json!({
                                "jsonrpc": "2.0",
                                "id": req_id,
                                "result": {
                                    "content": [{
                                        "type": "text",
                                        "text": e.to_string()
                                    }],
                                    "isError": true
                                }
                            })
                        }
                    }
                }
                _ => {
                    json!({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {
                            "code": -32601,
                            "message": format!("Method not found: {}", method)
                        }
                    })
                }
            };

            writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
            stdout.flush()?;
        }

        Ok(())
    }
}
