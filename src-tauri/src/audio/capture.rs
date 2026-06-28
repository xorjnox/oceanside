use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, SupportedStreamConfig};
use anyhow::{anyhow, Result};

pub struct DeviceInfo {
    pub id: String,
    pub name: String,
}

pub fn list_input_devices() -> Result<Vec<DeviceInfo>> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| anyhow!("cannot list devices: {e}"))?;
    let mut out = Vec::new();
    for (i, device) in devices.enumerate() {
        let name = device.name().unwrap_or_else(|_| format!("Device {i}"));
        out.push(DeviceInfo {
            id: i.to_string(),
            name,
        });
    }
    Ok(out)
}

pub fn get_device_by_id(id: &str) -> Result<(Device, SupportedStreamConfig)> {
    let host = cpal::default_host();
    let idx: usize = id.parse().map_err(|_| anyhow!("invalid device id"))?;
    let device = host
        .input_devices()?
        .nth(idx)
        .ok_or_else(|| anyhow!("device {id} not found"))?;
    let config = device.default_input_config()?;
    Ok((device, config))
}

/// Convert any cpal sample format to f32 in [-1, 1].
pub fn to_f32(sample: f32) -> f32 { sample }

/// Convert f32 [-1, 1] to i16.
pub fn f32_to_i16(s: f32) -> i16 {
    (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}

/// RMS of a chunk, returned as 0..1.
pub fn rms_level(samples: &[f32]) -> f32 {
    if samples.is_empty() { return 0.0; }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / samples.len() as f32).sqrt()
}

pub fn default_output_device() -> Result<Device> {
    cpal::default_host()
        .default_output_device()
        .ok_or_else(|| anyhow!("no output device"))
}
