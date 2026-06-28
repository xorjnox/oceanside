use hound::{WavSpec, WavWriter, SampleFormat};
use std::fs;
use anyhow::Result;

pub fn create_wav_writer(path: &str, sample_rate: u32, channels: u16) -> Result<WavWriter<std::io::BufWriter<fs::File>>> {
    let spec = WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let writer = WavWriter::create(path, spec)?;
    Ok(writer)
}
