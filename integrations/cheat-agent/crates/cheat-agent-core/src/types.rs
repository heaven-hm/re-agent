use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataType {
    Int8 = 1,
    Uint8 = 2,
    Int16 = 3,
    Uint16 = 4,
    Int32 = 5,
    Uint32 = 6,
    Int64 = 7,
    Uint64 = 8,
    Float = 9,
    Double = 10,
    ByteArray = 11,
    String = 12,
    Aob = 13,
}

impl DataType {
    pub fn byte_size(&self) -> usize {
        match self {
            DataType::Int8 | DataType::Uint8 => 1,
            DataType::Int16 | DataType::Uint16 => 2,
            DataType::Int32 | DataType::Uint32 | DataType::Float => 4,
            DataType::Int64 | DataType::Uint64 | DataType::Double => 8,
            DataType::ByteArray | DataType::String | DataType::Aob => 4,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanMode {
    Exact = 0,
    UnknownInitial = 1,
    Changed = 2,
    Unchanged = 3,
    Increased = 4,
    Decreased = 5,
    Range = 6,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryRegion {
    pub base_address: u64,
    pub size: u64,
    pub protection: u32,
    pub is_writable: bool,
    pub is_executable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    pub name: String,
    pub path: String,
    pub base_address: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointerChain {
    pub base_module: String,
    pub base_offset: u64,
    pub offsets: Vec<i64>,
}
