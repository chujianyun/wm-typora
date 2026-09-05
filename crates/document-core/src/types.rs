use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Format {
    pub encoding: String,
    pub eol: String,
}
impl Default for Format {
    fn default() -> Self {
        Self {
            encoding: "utf-8".into(),
            eol: "lf".into(),
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    pub hash: String,
    pub size: u64,
    pub modified_at_ns: String,
    pub identity: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub session_id: String,
    pub epoch: u64,
    pub path: Option<String>,
    pub text: String,
    pub format: Format,
    pub revision: Option<Revision>,
    pub read_only: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub session_id: String,
    pub epoch: u64,
    pub request_id: String,
    pub version: u64,
    pub text: String,
    pub expected: Option<Revision>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoreError {
    pub code: String,
    pub message: String,
}
impl CoreError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        Self::new(
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                "permission"
            } else {
                "io"
            },
            &e.to_string(),
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SaveOutcome {
    Saved {
        revision: Revision,
        durability: String,
    },
    Unchanged {
        revision: Revision,
        durability: String,
    },
    Conflict {
        disk: Option<Revision>,
    },
    Failed {
        error: CoreError,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReply {
    pub session_id: String,
    pub epoch: u64,
    pub request_id: String,
    pub version: u64,
    #[serde(flatten)]
    pub outcome: SaveOutcome,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySnapshot {
    pub session_id: String,
    pub epoch: u64,
    pub recovery_id: String,
    pub version: u64,
    pub text: String,
    pub format: Format,
    pub source_path: Option<String>,
    pub source_revision: Option<Revision>,
    pub updated_at: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryList {
    pub snapshots: Vec<RecoverySnapshot>,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskEvent {
    pub session_id: String,
    pub epoch: u64,
    pub event_seq: u64,
    pub kind: String,
    pub revision: Option<Revision>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAsResult {
    pub opened: Opened,
    pub reply: SaveReply,
}
