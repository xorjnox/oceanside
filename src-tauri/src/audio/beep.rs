use std::f32::consts::PI;

/// Generate a sine-wave beep as i16 PCM samples.
pub fn generate_beep_i16(freq_hz: f32, duration_sec: f32, sample_rate: u32) -> Vec<i16> {
    let n_samples = (duration_sec * sample_rate as f32) as usize;
    (0..n_samples)
        .map(|i| {
            let t = i as f32 / sample_rate as f32;
            let amplitude = 0.8_f32; // 80% full scale
            let fade_samples = (0.005 * sample_rate as f32) as usize; // 5ms fade
            let env = if i < fade_samples {
                i as f32 / fade_samples as f32
            } else if i > n_samples - fade_samples {
                (n_samples - i) as f32 / fade_samples as f32
            } else {
                1.0
            };
            (amplitude * env * (2.0 * PI * freq_hz * t).sin() * i16::MAX as f32) as i16
        })
        .collect()
}

/// Mix beep samples into dst starting at offset, clamping at dst length.
pub fn mix_beep_into(dst: &mut [i16], beep: &[i16], offset: usize) {
    for (i, &b) in beep.iter().enumerate() {
        let pos = offset + i;
        if pos >= dst.len() {
            break;
        }
        dst[pos] = dst[pos].saturating_add(b);
    }
}
