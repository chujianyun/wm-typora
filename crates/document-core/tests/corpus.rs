use std::{fs, path::PathBuf};
use wtypora_document_core::codec::{decode, encode};

#[test]
fn fixed_corpus_roundtrips_without_normalization() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/markdown");
    let manifest: Vec<serde_json::Value> =
        serde_json::from_slice(&fs::read(root.join("manifest.json")).unwrap()).unwrap();
    for sample in manifest {
        let bytes = fs::read(root.join(sample["file"].as_str().unwrap())).unwrap();
        let result = decode(&bytes);
        if sample["reject"] == true {
            assert!(result.is_err());
            continue;
        }
        let decoded = result.unwrap();
        assert_eq!(decoded.format.encoding, sample["encoding"]);
        assert_eq!(decoded.format.eol, sample["eol"]);
        assert_eq!(decoded.read_only, sample["readOnly"]);
        if !decoded.read_only {
            assert_eq!(encode(&decoded.text, &decoded.format).unwrap(), bytes);
        }
    }
}
