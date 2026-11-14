use anyhow::{Result, ensure};
use ort::environment::Environment;
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

static ENVIRONMENT: OnceLock<Mutex<Option<(PathBuf, Environment)>>> = OnceLock::new();

pub(crate) fn environment(runtime: &Path) -> Result<Environment> {
    let path = runtime.canonicalize()?;
    let mut shared = ENVIRONMENT
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| anyhow::anyhow!("The native inference environment lock is unavailable."))?;
    if let Some((loaded, environment)) = &*shared {
        ensure!(
            loaded == &path,
            "Restart the application to use the changed ONNX runtime."
        );
        return Ok(environment.clone());
    }
    // ONNX permits one environment per process, including across completed jobs and scenes.
    let environment = ort::init_from(&path)?.build()?;
    *shared = Some((path, environment.clone()));
    Ok(environment)
}
