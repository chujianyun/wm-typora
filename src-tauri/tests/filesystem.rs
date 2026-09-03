use std::fs;
use tempfile::tempdir;
use wtypora_lib::commands::{
    files::{
        read_text_file_impl, write_text_file_atomic_checked_impl, write_text_file_atomic_impl,
    },
    images::{copy_image_impl, resolve_image_asset_impl, store_image_impl},
    workspace::scan_workspace_impl,
};
use wtypora_lib::error::NativeError;
use wtypora_lib::state::AccessState;

#[test]
fn reads_and_atomically_replaces_utf8_inside_an_allowed_root() {
    let root = tempdir().unwrap();
    let path = root.path().join("hello.md");
    fs::write(&path, "你好").unwrap();
    let state = AccessState::default();
    state.grant_file(&path).unwrap();

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
    state.grant_directory(allowed.path()).unwrap();

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
    state.grant_directory(root.path()).unwrap();

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
    state.grant_file(&source).unwrap();
    state.grant_file(&document).unwrap();

    let copied = copy_image_impl(&state, &source, &document).unwrap();
    assert_eq!(copied.relative_path, "note.assets/photo-2.png");
    assert_eq!(fs::read_to_string(copied.absolute_path).unwrap(), "image");
}

#[test]
fn stores_pasted_image_bytes_next_to_the_document() {
    let document_dir = tempdir().unwrap();
    let document = document_dir.path().join("note.md");
    fs::write(&document, "note").unwrap();
    let state = AccessState::default();
    state.grant_file(&document).unwrap();

    let stored = store_image_impl(&state, "clipboard.png", b"png bytes", &document).unwrap();

    assert_eq!(stored.relative_path, "note.assets/clipboard.png");
    assert_eq!(fs::read(stored.absolute_path).unwrap(), b"png bytes");
}

#[test]
fn rejects_image_types_that_the_visual_editor_cannot_display() {
    let root = tempdir().unwrap();
    let document = root.path().join("note.md");
    fs::write(&document, "note").unwrap();
    let state = AccessState::default();
    state.grant_file(&document).unwrap();

    assert_eq!(
        store_image_impl(&state, "photo.heic", b"image", &document)
            .unwrap_err()
            .code,
        "unsupported_image"
    );
    assert!(!root.path().join("note.assets").exists());
}

#[test]
fn concurrent_same_name_images_never_overwrite_each_other() {
    use std::collections::HashSet;
    use std::sync::{Arc, Barrier};
    use std::thread;

    let root = tempdir().unwrap();
    let document = root.path().join("note.md");
    fs::write(&document, "note").unwrap();
    let state = Arc::new(AccessState::default());
    state.grant_file(&document).unwrap();
    let barrier = Arc::new(Barrier::new(8));
    let handles = (0..8)
        .map(|index| {
            let state = Arc::clone(&state);
            let barrier = Arc::clone(&barrier);
            let document = document.clone();
            thread::spawn(move || {
                barrier.wait();
                store_image_impl(
                    &state,
                    "photo.png",
                    format!("image-{index}").as_bytes(),
                    &document,
                )
                .unwrap()
            })
        })
        .collect::<Vec<_>>();
    let images = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<_>>();

    assert_eq!(
        images
            .iter()
            .map(|image| image.absolute_path.clone())
            .collect::<HashSet<_>>()
            .len(),
        8
    );
    assert_eq!(
        images
            .iter()
            .map(|image| fs::read_to_string(&image.absolute_path).unwrap())
            .collect::<HashSet<_>>()
            .len(),
        8
    );
}

#[test]
fn resolves_only_supported_images_inside_the_document_asset_directory() {
    let root = tempdir().unwrap();
    let document = root.path().join("note.md");
    let assets = root.path().join("note.assets");
    let image = assets.join("photo.png");
    let sibling = root.path().join("private.png");
    fs::write(&document, "note").unwrap();
    fs::create_dir(&assets).unwrap();
    fs::write(&image, "image").unwrap();
    fs::write(&sibling, "private").unwrap();
    let state = AccessState::default();
    state.grant_file(&document).unwrap();

    assert_eq!(
        resolve_image_asset_impl(&state, &document, &image).unwrap(),
        image.canonicalize().unwrap()
    );
    assert_eq!(
        resolve_image_asset_impl(&state, &document, &sibling)
            .unwrap_err()
            .code,
        "image_not_allowed"
    );
}

#[cfg(unix)]
#[test]
fn a_document_asset_symlink_cannot_escape_the_document_directory() {
    use std::os::unix::fs::symlink;

    let root = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let document = root.path().join("note.md");
    let assets_link = root.path().join("note.assets");
    let outside_image = outside.path().join("photo.png");
    fs::write(&document, "note").unwrap();
    fs::write(&outside_image, "private").unwrap();
    symlink(outside.path(), &assets_link).unwrap();
    let state = AccessState::default();
    state.grant_file(&document).unwrap();

    assert_eq!(
        store_image_impl(&state, "new.png", b"image", &document)
            .unwrap_err()
            .code,
        "image_not_allowed"
    );
    assert_eq!(
        resolve_image_asset_impl(&state, &document, &outside_image)
            .unwrap_err()
            .code,
        "image_not_allowed"
    );
    assert!(!outside.path().join("new.png").exists());
}

#[test]
fn a_selected_file_does_not_authorize_its_siblings() {
    let root = tempdir().unwrap();
    let selected = root.path().join("selected.md");
    let sibling = root.path().join("sibling.md");
    fs::write(&selected, "selected").unwrap();
    fs::write(&sibling, "sibling").unwrap();
    let state = AccessState::default();
    state.grant_file(&selected).unwrap();

    assert_eq!(
        read_text_file_impl(&state, &sibling).unwrap_err().code,
        "path_not_allowed"
    );
}

#[test]
fn a_new_save_target_does_not_authorize_its_parent_directory() {
    let root = tempdir().unwrap();
    let selected = root.path().join("new.md");
    let sibling = root.path().join("sibling.md");
    fs::write(&sibling, "sibling").unwrap();
    let state = AccessState::default();
    state.grant_file(&selected).unwrap();

    assert_eq!(
        read_text_file_impl(&state, &sibling).unwrap_err().code,
        "path_not_allowed"
    );
}

#[cfg(unix)]
#[test]
fn a_workspace_symlink_cannot_escape_the_selected_directory() {
    use std::os::unix::fs::symlink;

    let workspace = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let private = outside.path().join("private.md");
    let linked = workspace.path().join("linked.md");
    fs::write(&private, "private").unwrap();
    symlink(&private, &linked).unwrap();
    let state = AccessState::default();
    state.grant_directory(workspace.path()).unwrap();

    assert_eq!(
        read_text_file_impl(&state, &linked).unwrap_err().code,
        "path_not_allowed"
    );
}

#[cfg(unix)]
#[test]
fn atomic_replacement_preserves_existing_file_permissions() {
    use std::os::unix::fs::PermissionsExt;

    let root = tempdir().unwrap();
    let path = root.path().join("mode.md");
    fs::write(&path, "old").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
    let state = AccessState::default();
    state.grant_file(&path).unwrap();

    write_text_file_atomic_impl(&state, &path, "new").unwrap();

    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o640
    );
}

#[test]
fn native_errors_serialize_to_the_frontend_contract() {
    let error = NativeError::new("io_error", "Permission denied").at("/notes/private.md");

    assert_eq!(
        serde_json::to_value(error).unwrap(),
        serde_json::json!({
            "code": "io_error",
            "message": "Permission denied",
            "path": "/notes/private.md"
        })
    );
}

#[test]
fn rejects_atomic_save_when_the_expected_digest_is_stale() {
    let root = tempdir().unwrap();
    let path = root.path().join("conflict.md");
    fs::write(&path, "disk v1").unwrap();
    let state = AccessState::default();
    state.grant_file(&path).unwrap();
    let original = read_text_file_impl(&state, &path).unwrap();
    fs::write(&path, "external edit").unwrap();

    let error =
        write_text_file_atomic_checked_impl(&state, &path, "local edit", Some(&original.digest))
            .unwrap_err();

    assert_eq!(error.code, "external_change");
    assert_eq!(fs::read_to_string(&path).unwrap(), "external edit");
}
