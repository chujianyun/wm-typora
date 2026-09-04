use std::fs;
use tempfile::tempdir;
use wtypora_lib::{
    commands::files::read_text_file_impl,
    state::{AccessState, PendingOpenFiles},
};

#[test]
fn desktop_open_requests_authorize_supported_documents_and_are_drained_once() {
    let root = tempdir().unwrap();
    let markdown = root.path().join("opened-from-finder.md");
    let image = root.path().join("ignored.png");
    fs::write(&markdown, "# Finder document").unwrap();
    fs::write(&image, "not a document").unwrap();
    let access = AccessState::default();
    let pending = PendingOpenFiles::default();

    pending.enqueue_path(&markdown);
    pending.enqueue_path(&image);

    assert_eq!(
        pending.take_paths(&access).unwrap(),
        vec![markdown.canonicalize().unwrap().to_string_lossy()]
    );
    assert_eq!(
        read_text_file_impl(&access, &markdown).unwrap().markdown,
        "# Finder document"
    );
    assert!(pending.take_paths(&access).unwrap().is_empty());
}
