#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().any(|argument| argument == "--openapi") {
        use utoipa::OpenApi;
        println!(
            "{}",
            serde_json::to_string_pretty(&unlimitedclipper_engine::api::ApiDoc::openapi())?
        );
        return Ok(());
    }
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let mut attempt = 0;
    let engine = loop {
        match unlimitedclipper_engine::start().await {
            Ok(engine) => break engine,
            Err(error) if std::env::var_os("UC_RESTART_WAIT").is_some() && attempt < 20 => {
                tracing::debug!(%error, "Waiting for the previous engine to release its files");
                attempt += 1;
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            Err(error) => return Err(error),
        }
    };
    println!("UnlimitedClipper: {}", engine.studio_url());
    tokio::select! {
        result = tokio::signal::ctrl_c() => result?,
        _ = engine.state.restart.notified() => {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let mut command = std::process::Command::new(std::env::current_exe()?);
            command.args(std::env::args_os().skip(1)).env("UC_RESTART_WAIT", "1");
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            command.spawn()?;
            std::process::exit(0);
        }
    }
    Ok(())
}
