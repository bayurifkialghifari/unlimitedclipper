use std::path::PathBuf;
use tokio_util::sync::CancellationToken;
use unlimitedclipper_engine::narration;

fn main() -> anyhow::Result<()> {
    let mut arguments = std::env::args().skip(1);
    let pack = PathBuf::from(arguments.next().expect("Pack directory is required"));
    let runtime = PathBuf::from(arguments.next().expect("ONNX runtime path is required"));
    let output = PathBuf::from(arguments.next().expect("Output path is required"));
    let language = arguments.next().unwrap_or_else(|| "id".into());
    let text = if language == "id" {
        "Selamat datang di cerita kami."
    } else {
        "Welcome to our story."
    };
    let (samples, sample_rate) = narration::synthesize(
        &pack,
        &runtime,
        text,
        &language,
        "M1",
        &CancellationToken::new(),
    )?;
    let mut writer = hound::WavWriter::create(
        output,
        hound::WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        },
    )?;
    for sample in &samples {
        writer.write_sample((sample.clamp(-1.0, 1.0) * 32767.0) as i16)?;
    }
    writer.finalize()?;
    let power = samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32;
    println!(
        "samples={} rate={} rms={:.4}",
        samples.len(),
        sample_rate,
        power.sqrt()
    );
    Ok(())
}
