use anyhow::Result;
use std::{future::Future, pin::Pin};
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;

pub struct NativeProgress {
    pub elapsed_ms: i64,
}

pub type NativeExecution = Pin<Box<dyn Future<Output = Result<Vec<u8>>> + Send>>;

pub trait NativeTools: Send + Sync {
    fn supports(&self, name: &str) -> bool;

    fn execute(
        &self,
        name: String,
        arguments: Vec<String>,
        progress: Option<UnboundedSender<NativeProgress>>,
        cancellation: CancellationToken,
    ) -> NativeExecution;
}

pub fn media_arguments(arguments: &[String]) -> Vec<String> {
    let hardware_video = arguments
        .windows(2)
        .any(|pair| pair[0] == "-c:v" && pair[1] == "libx264");
    let mut result = Vec::new();
    let mut index = 0;
    while index < arguments.len() {
        let argument = &arguments[index];
        if argument == "-progress"
            || (hardware_video && matches!(argument.as_str(), "-preset" | "-crf"))
        {
            index += 2;
            continue;
        }
        if argument == "-nostats" {
            index += 1;
            continue;
        }
        if hardware_video && argument == "-c:v" && arguments.get(index + 1).is_some() {
            result.extend([
                "-c:v".into(),
                "h264_mediacodec".into(),
                "-b:v".into(),
                "5000000".into(),
            ]);
            index += 2;
            continue;
        }
        result.push(argument.clone());
        index += 1;
    }
    result
}
