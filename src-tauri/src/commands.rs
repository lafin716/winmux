use std::path::PathBuf;
use std::sync::Arc;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::ipc::client::DaemonClient;
use crate::ipc::protocol::{AttachResult, Method};
use crate::pty::SessionInfo;

type ClientState<'a> = State<'a, Arc<DaemonClient>>;

#[tauri::command]
pub async fn create_session(
    client: ClientState<'_>,
    name: Option<String>,
    shell: Option<String>,
    shell_args: Option<Vec<String>>,
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<SessionInfo, String> {
    let cols = cols.unwrap_or(120);
    let rows = rows.unwrap_or(30);
    client
        .request(Method::CreateSession {
            name,
            shell,
            shell_args: shell_args.unwrap_or_default(),
            cwd,
            cols,
            rows,
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_sessions(client: ClientState<'_>) -> Result<Vec<SessionInfo>, String> {
    client
        .request(Method::ListSessions)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kill_session(client: ClientState<'_>, id: Uuid) -> Result<(), String> {
    client
        .request_raw(Method::KillSession { id })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_session(client: ClientState<'_>, id: Uuid, data: String) -> Result<(), String> {
    client
        .request_raw(Method::WriteSession { id, data })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resize_session(
    client: ClientState<'_>,
    id: Uuid,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    client
        .request_raw(Method::ResizeSession { id, cols, rows })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn attach_session(client: ClientState<'_>, id: Uuid) -> Result<String, String> {
    let result: AttachResult = client
        .request(Method::AttachSession { id })
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.scrollback)
}

#[tauri::command]
pub async fn rename_session(client: ClientState<'_>, id: Uuid, name: String) -> Result<(), String> {
    client
        .request_raw(Method::RenameSession { id, name })
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

const MAX_PREVIEW_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    canonical_path: String,
    name: String,
    kind: &'static str,
    language: String,
    mime: String,
    text: Option<String>,
    data: Option<String>,
    size: u64,
    line: Option<u32>,
    column: Option<u32>,
}

#[tauri::command]
pub async fn read_file_preview(target: String, cwd: Option<String>) -> Result<FilePreview, String> {
    tauri::async_runtime::spawn_blocking(move || read_file_preview_sync(&target, cwd.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

fn read_file_preview_sync(target: &str, cwd: Option<&str>) -> Result<FilePreview, String> {
    let (raw_path, line, column) = split_file_location(target);
    let candidate = PathBuf::from(&raw_path);
    let joined = if candidate.is_absolute() {
        candidate
    } else {
        let base = cwd
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .or_else(|| std::env::current_dir().ok())
            .ok_or_else(|| "Unable to determine the working directory.".to_string())?;
        base.join(candidate)
    };
    let canonical = joined
        .canonicalize()
        .map_err(|e| format!("File not found: {} ({e})", joined.display()))?;
    if !canonical.is_file() {
        return Err(format!("Not a file: {}", canonical.display()));
    }
    let metadata = canonical.metadata().map_err(|e| e.to_string())?;
    let size = metadata.len();
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let (language, mime) = file_type(&extension);
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_string();
    let canonical_path = canonical.to_string_lossy().into_owned();

    if size > MAX_PREVIEW_BYTES {
        return Ok(FilePreview {
            canonical_path,
            name,
            kind: "too_large",
            language: language.to_string(),
            mime: mime.to_string(),
            text: None,
            data: None,
            size,
            line,
            column,
        });
    }

    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    if mime.starts_with("image/") {
        return Ok(FilePreview {
            canonical_path,
            name,
            kind: "image",
            language: language.to_string(),
            mime: mime.to_string(),
            text: None,
            data: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
            size,
            line,
            column,
        });
    }

    match String::from_utf8(bytes) {
        Ok(text) => Ok(FilePreview {
            canonical_path,
            name,
            kind: "text",
            language: language.to_string(),
            mime: mime.to_string(),
            text: Some(text),
            data: None,
            size,
            line,
            column,
        }),
        Err(_) => Ok(FilePreview {
            canonical_path,
            name,
            kind: "binary",
            language: language.to_string(),
            mime: "application/octet-stream".to_string(),
            text: None,
            data: None,
            size,
            line,
            column,
        }),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    hidden: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    /// Canonical path of the directory that was read.
    path: String,
    entries: Vec<DirEntryInfo>,
}

/// Read a single directory's immediate entries for the Explorer tree. The tree
/// loads one level at a time, so this never recurses. Entries are sorted
/// directories-first then case-insensitively by name; dotfiles are surfaced but
/// flagged `hidden` so the UI can dim them.
#[tauri::command]
pub async fn read_directory(path: String) -> Result<DirListing, String> {
    tauri::async_runtime::spawn_blocking(move || read_directory_sync(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn read_directory_sync(path: &str) -> Result<DirListing, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("No directory to read.".to_string());
    }
    let canonical = PathBuf::from(trimmed)
        .canonicalize()
        .map_err(|e| format!("Directory not found: {trimmed} ({e})"))?;
    if !canonical.is_dir() {
        return Err(format!("Not a directory: {}", canonical.display()));
    }
    let entries = list_directory(&canonical)?;
    Ok(DirListing {
        path: canonical.to_string_lossy().into_owned(),
        entries,
    })
}

fn list_directory(dir: &std::path::Path) -> Result<Vec<DirEntryInfo>, String> {
    let read = std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read directory {}: {e}", dir.display()))?;
    let mut entries: Vec<DirEntryInfo> = Vec::new();
    for item in read {
        let item = item.map_err(|e| e.to_string())?;
        let name = item.file_name().to_string_lossy().into_owned();
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let hidden = name.starts_with('.');
        entries.push(DirEntryInfo {
            name,
            path: item.path().to_string_lossy().into_owned(),
            is_dir,
            hidden,
        });
    }
    entries.sort_by(|a, b| {
        // Directories before files, then case-insensitive name, then a stable
        // case-sensitive tiebreak so ordering is deterministic.
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(entries)
}

fn split_file_location(target: &str) -> (String, Option<u32>, Option<u32>) {
    let mut value = target
        .trim()
        .trim_matches(|c| {
            matches!(
                c,
                '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
            )
        })
        .to_string();
    let mut numbers = Vec::new();
    for _ in 0..2 {
        let Some((prefix, suffix)) = value.rsplit_once(':') else {
            break;
        };
        let Ok(number) = suffix.parse::<u32>() else {
            break;
        };
        numbers.push(number);
        value = prefix.to_string();
    }
    value = value
        .trim()
        .trim_matches(|c| {
            matches!(
                c,
                '"' | '\'' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
            )
        })
        .to_string();
    match numbers.as_slice() {
        [line] => (value, Some(*line), None),
        [column, line] => (value, Some(*line), Some(*column)),
        _ => (value, None, None),
    }
}

fn file_type(extension: &str) -> (&'static str, &'static str) {
    match extension {
        "rs" => ("rust", "text/plain"),
        "ts" | "tsx" => ("typescript", "text/plain"),
        "js" | "jsx" | "mjs" | "cjs" => ("javascript", "text/plain"),
        "vue" => ("vue", "text/plain"),
        "json" => ("json", "application/json"),
        "toml" => ("toml", "text/plain"),
        "yaml" | "yml" => ("yaml", "text/plain"),
        "md" => ("markdown", "text/markdown"),
        "html" | "htm" => ("html", "text/html"),
        "css" | "scss" | "less" => ("css", "text/css"),
        "py" => ("python", "text/plain"),
        "sh" | "bash" => ("shell", "text/plain"),
        "ps1" => ("powershell", "text/plain"),
        "cmd" | "bat" => ("batch", "text/plain"),
        "c" | "h" => ("c", "text/plain"),
        "cpp" | "cc" | "cxx" | "hpp" => ("cpp", "text/plain"),
        "png" => ("image", "image/png"),
        "jpg" | "jpeg" => ("image", "image/jpeg"),
        "gif" => ("image", "image/gif"),
        "webp" => ("image", "image/webp"),
        "bmp" => ("image", "image/bmp"),
        "svg" => ("image", "image/svg+xml"),
        _ => ("plaintext", "text/plain"),
    }
}

fn browser_webview(app: &AppHandle, label: &str) -> Result<tauri::Webview, String> {
    app.get_webview(label)
        .ok_or_else(|| format!("Browser webview not found: {label}"))
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Only HTTP and HTTPS URLs are allowed.".to_string());
    }
    browser_webview(&app, &label)?
        .navigate(parsed)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_back(app: AppHandle, label: String) -> Result<(), String> {
    browser_webview(&app, &label)?
        .eval("history.back()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, label: String) -> Result<(), String> {
    browser_webview(&app, &label)?
        .eval("history.forward()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, label: String) -> Result<(), String> {
    browser_webview(&app, &label)?
        .eval("location.reload()")
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod directory_tests {
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("winmux-dir-test-{}-{}", tag, uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_entries_with_directories_first_then_case_insensitive_name() {
        let dir = temp_dir("sorted");
        fs::create_dir(dir.join("zeta")).unwrap();
        fs::create_dir(dir.join("Alpha")).unwrap();
        fs::write(dir.join("banana.txt"), b"x").unwrap();
        fs::write(dir.join("Apple.txt"), b"x").unwrap();

        let entries = super::list_directory(&dir).unwrap();
        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "zeta", "Apple.txt", "banana.txt"]);
        assert!(entries[0].is_dir);
        assert!(entries[1].is_dir);
        assert!(!entries[2].is_dir);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn flags_dotfiles_as_hidden_but_still_lists_them() {
        let dir = temp_dir("hidden");
        fs::write(dir.join(".env"), b"secret").unwrap();
        fs::write(dir.join("visible.txt"), b"x").unwrap();

        let entries = super::list_directory(&dir).unwrap();
        let dotfile = entries
            .iter()
            .find(|e| e.name == ".env")
            .expect("dotfile is still listed");
        assert!(dotfile.hidden);
        let visible = entries.iter().find(|e| e.name == "visible.txt").unwrap();
        assert!(!visible.hidden);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reports_each_entry_full_path() {
        let dir = temp_dir("paths");
        fs::write(dir.join("file.txt"), b"x").unwrap();

        let entries = super::list_directory(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, dir.join("file.txt").to_string_lossy());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn errors_when_the_target_is_not_a_directory() {
        let dir = temp_dir("notdir");
        let file = dir.join("a.txt");
        fs::write(&file, b"x").unwrap();

        assert!(super::read_directory_sync(file.to_str().unwrap()).is_err());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn reads_a_directory_listing_through_the_sync_entry_point() {
        let dir = temp_dir("listing");
        fs::create_dir(dir.join("sub")).unwrap();
        fs::write(dir.join("top.txt"), b"x").unwrap();

        let listing = super::read_directory_sync(dir.to_str().unwrap()).unwrap();
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, vec!["sub", "top.txt"]);

        fs::remove_dir_all(&dir).ok();
    }
}

#[cfg(test)]
mod resource_tests {
    use super::split_file_location;

    #[test]
    fn parses_windows_path_and_location() {
        let (path, line, column) = split_file_location(r#"C:\work\main.rs:12:4"#);
        assert_eq!(path, r#"C:\work\main.rs"#);
        assert_eq!(line, Some(12));
        assert_eq!(column, Some(4));
    }

    #[test]
    fn preserves_drive_letter_without_location() {
        let (path, line, column) = split_file_location(r#"C:\work\main.rs"#);
        assert_eq!(path, r#"C:\work\main.rs"#);
        assert_eq!(line, None);
        assert_eq!(column, None);
    }

    #[test]
    fn parses_quoted_path_with_location() {
        let (path, line, column) = split_file_location(r#""C:\work dir\main.ts":8:2"#);
        assert_eq!(path, r#"C:\work dir\main.ts"#);
        assert_eq!(line, Some(8));
        assert_eq!(column, Some(2));
    }
}
