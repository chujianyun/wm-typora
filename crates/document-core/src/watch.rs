//! Directory events invalidate cached observations; they never grant permission
//! to write and never supply an authoritative document revision.
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
pub(crate) struct Invalidation {
    generation: Arc<AtomicU64>,
    healthy: Arc<AtomicBool>,
    state: Mutex<State>,
}
struct State {
    watcher: Option<RecommendedWatcher>,
    parents: HashSet<PathBuf>,
}
impl Invalidation {
    pub(crate) fn new() -> Self {
        let generation = Arc::new(AtomicU64::new(0));
        let healthy = Arc::new(AtomicBool::new(true));
        let event_generation = generation.clone();
        let event_health = healthy.clone();
        let watcher =
            notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
                Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => {
                    event_generation.fetch_add(1, Ordering::Release);
                }
                Ok(_) => {}
                Err(_) => {
                    event_health.store(false, Ordering::Release);
                    event_generation.fetch_add(1, Ordering::Release);
                }
            })
            .ok();
        if watcher.is_none() {
            healthy.store(false, Ordering::Release);
        }
        Self {
            generation,
            healthy,
            state: Mutex::new(State {
                watcher,
                parents: HashSet::new(),
            }),
        }
    }
    pub(crate) fn generation(&self) -> u64 {
        self.generation.load(Ordering::Acquire)
    }
    pub(crate) fn healthy(&self) -> bool {
        self.healthy.load(Ordering::Acquire)
    }
    pub(crate) fn sync(&self, parents: HashSet<PathBuf>) {
        let Ok(mut state) = self.state.lock() else {
            self.healthy.store(false, Ordering::Release);
            return;
        };
        let removed: Vec<_> = state.parents.difference(&parents).cloned().collect();
        let added: Vec<_> = parents.difference(&state.parents).cloned().collect();
        if let Some(watcher) = state.watcher.as_mut() {
            for parent in removed {
                if watcher.unwatch(&parent).is_err() {
                    self.healthy.store(false, Ordering::Release);
                }
            }
            for parent in added {
                if watcher.watch(&parent, RecursiveMode::NonRecursive).is_err() {
                    self.healthy.store(false, Ordering::Release);
                }
            }
        }
        state.parents = parents;
        self.generation.fetch_add(1, Ordering::Release);
    }
}
