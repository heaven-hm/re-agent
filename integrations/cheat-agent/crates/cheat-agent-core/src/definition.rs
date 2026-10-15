use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheatDefinition {
    pub schema_version: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub target: TargetSpec,
    pub value: ValueSpec,
    pub resolution: ResolutionSpec,
    pub verification: VerificationSpec,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetSpec {
    pub name: String,
    pub architecture: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValueSpec {
    #[serde(rename = "type")]
    pub value_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desired: Option<serde_json::Value>,
    #[serde(default)]
    pub freeze: bool,
    #[serde(default = "default_freeze_interval")]
    pub freeze_interval_ms: u64,
}

fn default_freeze_interval() -> u64 {
    50
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolutionSpec {
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub static_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub module: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_offset: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offsets: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aob_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationSpec {
    pub status: String,
    pub restart_count: u32,
    #[serde(default)]
    pub evidence: Vec<String>,
}
