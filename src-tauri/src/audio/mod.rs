pub mod capture;
pub mod beep;
pub mod writer;

use std::sync::{Arc, Mutex};

/// Shared state managed by Tauri; audio thread holds an Arc clone.
#[derive(Default)]
pub struct AudioState {
    pub recording: Arc<Mutex<Option<RecordingHandle>>>,
    pub mic_test: Arc<Mutex<Option<MicTestHandle>>>,
}

pub struct RecordingHandle {
    pub stop_tx: tokio::sync::oneshot::Sender<()>,
    pub output_path: String,
    /// Sender to queue a beep injection at the current write position.
    pub beep_tx: std::sync::mpsc::Sender<BeepParams>,
}

pub struct MicTestHandle {
    pub stop_tx: tokio::sync::oneshot::Sender<()>,
    pub output_path: String,
}

#[derive(Clone, Debug)]
pub struct BeepParams {
    pub freq_hz: f32,
    pub duration_sec: f32,
    pub sample_rate: u32,
}
