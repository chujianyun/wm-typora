use wtypora_document_core::codec::{decode, encode};
#[test]
fn crlf_bom_roundtrip() {
    let b = b"\xEF\xBB\xBF# title\r\n\r\n";
    let d = decode(b).unwrap();
    assert_eq!(d.text, "# title\r\n\r\n");
    assert_eq!(d.format.encoding, "utf-8-bom");
    assert_eq!(d.format.eol, "crlf");
    assert_eq!(encode(&d.text, &d.format).unwrap(), b);
}
#[test]
fn unknown_markdown_unchanged() {
    let b = "---\nprivate: something\n---\n<div>你好🦀</div>\n\n```unknown\nx\n```".as_bytes();
    let d = decode(b).unwrap();
    assert_eq!(encode(&d.text, &d.format).unwrap(), b);
}
#[test]
fn unsafe_encoding_rejected() {
    for b in [vec![255, 254], vec![65, 0, 66]] {
        assert!(decode(&b).is_err());
    }
}
#[test]
fn mixed_and_cr_readonly() {
    for text in ["one\r\ntwo\n", "one\rtwo"] {
        let d = decode(text.as_bytes()).unwrap();
        assert!(d.read_only);
        assert!(encode(&d.text, &d.format).is_err());
    }
}
#[test]
fn preserves_empty_trailing_whitespace_and_unicode() {
    for s in ["", "a  \n\n", "e\u{301}\n😀", "a\r\nb\r\n"] {
        let d = decode(s.as_bytes()).unwrap();
        assert_eq!(encode(&d.text, &d.format).unwrap(), s.as_bytes());
    }
}
