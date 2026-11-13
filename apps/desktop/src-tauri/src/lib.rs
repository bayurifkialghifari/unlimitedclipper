#[cfg(not(target_os = "android"))]
mod desktop;
#[cfg(target_os = "android")]
mod mobile;
#[cfg(not(target_os = "android"))]
mod updates;

#[cfg_attr(target_os = "android", tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "android")]
    mobile::run();
    #[cfg(not(target_os = "android"))]
    desktop::run();
}
