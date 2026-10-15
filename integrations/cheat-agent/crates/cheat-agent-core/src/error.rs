use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum CheatError {
    #[error("Target process not connected or terminated")]
    NotConnected,

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Memory read failed at address 0x{address:X}")]
    ReadFailed { address: u64, message: String },

    #[error("Memory write failed at address 0x{address:X}")]
    WriteFailed { address: u64, message: String },

    #[error("Partial read: requested {requested} bytes, read {actual}")]
    PartialRead { requested: usize, actual: usize },

    #[error("OS capability missing on current platform: {0}")]
    CapabilityMissing(String),

    #[error("Verification failed at stage {stage}: {reason}")]
    VerificationFailed { stage: String, reason: String },

    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, CheatError>;
