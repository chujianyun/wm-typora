use std::fs;
use tempfile::tempdir;
use wtypora_lib::commands::{
    files::{read_text_file_impl, write_text_file_atomic_impl},
    images::copy_image_impl,
    workspace::scan_workspace_impl,
};
use wtypora_lib::state::AccessState;

#[test]
fn reads_and_atomically_replaces_utf8_inside_an_allowed_root() {
    let root = tempdir().unwrap();
    let path = root.path().join("hello.md");
    fs::write(&path, "你好").unwrap();
    let state = AccessState::default();
    state.grant(root.path()).unwrap();

    let read = read_text_file_impl(&state, &path).unwrap();
    assert_eq!(read.markdown, "你好");

    write_text_file_atomic_impl(&state, &path, "更新").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "更新");
}

#[test]
fn rejects_paths_outside_granted_roots() {
    let allowed = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let path = outside.path().join("private.md");
    fs::write(&path, "private").unwrap();
    let state = AccessState::default();
    state.grant(allowed.path()).unwrap();

    let error = read_text_file_impl(&state, &path).unwrap_err();
    assert_eq!(error.code, "path_not_allowed");
}

#[test]
fn scans_supported_files_and_ignores_hidden_and_build_directories() {
    let root = tempdir().unwrap();
    fs::create_dir_all(root.path().join("topics")).unwrap();
    fs::create_dir_all(root.path().join("node_modules/pkg")).unwrap();
    fs::write(root.path().join("guide.md"), "guide").unwrap();
    fs::write(root.path().join("image.png"), "image").unwrap();
    fs::write(root.path().join(".secret.md"), "secret").unwrap();
    fs::write(root.path().join("topics/deep.markdown"), "deep").unwrap();
    fs::write(root.path().join("node_modules/pkg/readme.md"), "ignored").unwrap();
    let state = AccessState::default();
    state.grant(root.path()).unwrap();

    let entries = scan_workspace_impl(&state, root.path()).unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].name, "guide.md");
    assert_eq!(entries[1].name, "topics");
    assert_eq!(entries[1].children[0].name, "deep.markdown");
}

#[test]
fn copies_images_with_a_collision_safe_name() {
    let source_dir = tempdir().unwrap();
    let document_dir = tempdir().unwrap();
    let source = source_dir.path().join("photo.png");
    let document = document_dir.path().join("note.md");
    fs::write(&source, "image").unwrap();
    fs::write(&document, "note").unwrap();
    fs::create_dir(document_dir.path().join("note.assets")).unwrap();
    fs::write(document_dir.path().join("note.assets/photo.png"), "old").unwrap();
    let state = AccessState::default();
    state.grant(source_dir.path()).unwrap();
    state.grant(document_dir.path()).unwrap();

    let copied = copy_image_impl(&state, &source, &document).unwrap();
    assert_eq!(copied.relative_path, "note.assets/photo-2.png");
    assert_eq!(fs::read_to_string(copied.absolute_path).unwrap(), "image");
}
