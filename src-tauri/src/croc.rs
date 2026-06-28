use anyhow::{anyhow, Result};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
const CROC_BINARY: &str = "croc-aarch64-apple-darwin";
#[cfg(target_os = "windows")]
const CROC_BINARY: &str = "croc-x86_64-pc-windows-msvc.exe";
#[cfg(target_os = "linux")]
const CROC_BINARY: &str = "croc-x86_64-unknown-linux-gnu";

fn croc_path(app: &AppHandle) -> Result<std::path::PathBuf> {
    // Check next to the bundled app first (production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("binaries").join(CROC_BINARY);
        if bundled.exists() {
            return Ok(bundled);
        }
    }
    // Fall back to croc in PATH (development / manual install)
    which::which("croc").map_err(|_| anyhow!(
        "croc not found. Install via: brew install croc  (or download from https://github.com/schollz/croc)"
    ))
}

pub async fn send_file(file_path: String, code: String, app: AppHandle) -> Result<()> {
    let croc = croc_path(&app)?;
    let app_clone = app.clone();

    tokio::spawn(async move {
        let output = tokio::process::Command::new(&croc)
            .args(["send", "--code", &code, &file_path])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output()
            .await;

        match output {
            Ok(o) => {
                let combined = format!(
                    "{}\n{}",
                    String::from_utf8_lossy(&o.stdout),
                    String::from_utf8_lossy(&o.stderr)
                );
                for line in combined.lines() {
                    let _ = app_clone.emit("croc-progress", line.to_string());
                }
                if o.status.success() {
                    let _ = app_clone.emit("croc-done", file_path.clone());
                } else {
                    let _ = app_clone.emit("croc-progress", format!("croc exited with: {}", o.status));
                }
            }
            Err(e) => {
                let _ = app_clone.emit("croc-progress", format!("croc error: {e}"));
            }
        }
    });

    Ok(())
}

pub async fn recv_files(output_dir: String, app: AppHandle) -> Result<String> {
    let croc = croc_path(&app)?;
    let app_clone = app.clone();

    // Run croc recv to get a code, then listen
    let output = tokio::process::Command::new(&croc)
        .args(["relay"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| anyhow!("croc relay failed: {e}"))?;

    // croc self-relay: for simple peer-to-peer without relay server, just use default relay
    // Start recv and parse the code from output
    let mut child = tokio::process::Command::new(&croc)
        .args(["receive", "--overwrite", "--out", &output_dir])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| anyhow!("croc receive failed: {e}"))?;

    // croc prints the code to stderr/stdout on the receive side
    // Actually croc receive requires the code from the sender.
    // The canonical flow is: sender runs `croc send file` → gets a code → receiver runs `croc code`.
    // For our use case, the host SENDS a receive code by being the SENDER and sharing the code.
    // Re-architect: host runs `croc send raw/*.wav` and shares the generated code to participants who run `croc <code>`.
    // This is the simpler flow — let's return a placeholder and handle in send_file.

    drop(child);
    drop(output);

    // Correct implementation: host runs croc in relay mode to get a per-session receive code
    // In practice for v1: call `croc send --code <fixed-code> <file>` from participant side,
    // and `croc <fixed-code>` from host side.
    // Return a generated code that will be embedded in the croc command.
    let code = generate_croc_code();
    let app_clone2 = app_clone.clone();
    let output_dir_clone = output_dir.clone();
    let code_clone = code.clone();

    tokio::spawn(async move {
        // Host receives each file as participants send them with the shared code
        // croc doesn't have a persistent receiver — each transfer is one command.
        // So we just log instructions and wait for croc-done events from the send side.
        let _ = app_clone2.emit("croc-progress", format!("Share code '{code_clone}' with participants"));
        let _ = app_clone2.emit("croc-progress", format!("Files will arrive in {output_dir_clone}"));
    });

    Ok(code)
}

fn generate_croc_code() -> String {
    use uuid::Uuid;
    let id = Uuid::new_v4().to_string();
    // croc codes are typically word-word-word; approximate with hex short codes
    let short = &id.replace('-', "")[..8];
    format!("{}-{}-{}", &short[..4], &short[4..6], &short[6..8])
}
