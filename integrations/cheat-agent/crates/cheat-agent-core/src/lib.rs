pub mod error;
pub mod types;
pub mod definition;
pub mod report;

pub use error::{CheatError, Result};
pub use types::{DataType, ScanMode, MemoryRegion, ModuleInfo, PointerChain};
pub use definition::{CheatDefinition, TargetSpec, ValueSpec, ResolutionSpec, VerificationSpec};
pub use report::{VerificationReport, VerificationStages};
