pub mod files;
pub mod images;
pub mod watcher;
pub mod workspace;

use crate::{error::NativeResult, state::AccessState};
use tauri::State;

#[tauri::command]
pub fn grant_path(state: State<'_, AccessState>, path: String) -> NativeResult<()> {
    state.grant(path)?;
    Ok(())
}
