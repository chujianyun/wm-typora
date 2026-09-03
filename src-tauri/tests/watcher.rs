use std::{fs, sync::mpsc, time::Duration};
use tempfile::tempdir;
use wtypora_lib::commands::watcher::watch_file_impl;

#[test]
fn reports_external_file_modifications() {
    let root = tempdir().unwrap();
    let path = root.path().join("watched.md");
    fs::write(&path, "first").unwrap();
    let (sender, receiver) = mpsc::channel();
    let _watcher = watch_file_impl(&path, move |changed| {
        let _ = sender.send(changed);
    })
    .unwrap();

    fs::write(&path, "second").unwrap();

    let changed = receiver.recv_timeout(Duration::from_secs(3)).unwrap();
    assert_eq!(changed, path.canonicalize().unwrap());
}
