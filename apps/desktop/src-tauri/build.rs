fn main() {
    if std::env::var("TARGET").is_ok_and(|target| target.ends_with("windows-gnullvm")) {
        // Desktop consumes the Rust library directly; MinGW auto-exports can exceed PE limits.
        println!("cargo:rustc-cdylib-link-arg=-Wl,--exclude-all-symbols");
    }
    tauri_build::build();
}
