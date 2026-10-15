use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationReport {
    pub cheat_name: String,
    pub target_pid: u32,
    pub overall_status: String,
    pub stages: VerificationStages,
    pub restart_runs: u32,
    #[serde(default)]
    pub evidence_log: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VerificationStages {
    pub memory_write: bool,
    pub game_behavior: bool,
    pub restart_persistence: bool,
    pub trainer_compilation: bool,
    pub trainer_execution: bool,
}
