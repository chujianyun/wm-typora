use crate::types::{CoreError, Format};
pub struct Decoded {
    pub text: String,
    pub format: Format,
    pub read_only: bool,
}
pub fn decode(bytes: &[u8]) -> Result<Decoded, CoreError> {
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(CoreError::new("limit", "文件超过 32 MiB"));
    }
    let (body, bom) = bytes
        .strip_prefix(&[239, 187, 191])
        .map_or((bytes, false), |b| (b, true));
    let text =
        std::str::from_utf8(body).map_err(|_| CoreError::new("encoding", "只支持 UTF-8 文本"))?;
    if text.contains('\0') {
        return Err(CoreError::new("encoding", "文件包含二进制内容"));
    }
    let (mut lf, mut crlf, mut cr) = (false, false, false);
    let mut i = 0;
    while i < body.len() {
        match body[i] {
            b'\r' if body.get(i + 1) == Some(&b'\n') => {
                crlf = true;
                i += 1;
            }
            b'\r' => cr = true,
            b'\n' => lf = true,
            _ => {}
        }
        i += 1;
    }
    let count = lf as u8 + crlf as u8 + cr as u8;
    let eol = if count > 1 {
        "mixed"
    } else if cr {
        "cr"
    } else if crlf {
        "crlf"
    } else {
        "lf"
    };
    Ok(Decoded {
        text: text.into(),
        format: Format {
            encoding: if bom { "utf-8-bom" } else { "utf-8" }.into(),
            eol: eol.into(),
        },
        read_only: count > 1 || cr,
    })
}
pub fn encode(text: &str, format: &Format) -> Result<Vec<u8>, CoreError> {
    if !["lf", "crlf"].contains(&format.eol.as_str()) {
        return Err(CoreError::new("encoding", "此换行格式仅支持只读"));
    }
    if !["utf-8", "utf-8-bom"].contains(&format.encoding.as_str()) {
        return Err(CoreError::new("encoding", "未知编码"));
    }
    let check = decode(text.as_bytes())?;
    if check.read_only || (text.contains('\n') && check.format.eol != format.eol) {
        return Err(CoreError::new("encoding", "换行格式不一致"));
    }
    let mut bytes = Vec::new();
    if format.encoding == "utf-8-bom" {
        bytes.extend([239, 187, 191]);
    }
    bytes.extend(text.as_bytes());
    Ok(bytes)
}
