pub fn run() {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_haptics::init())
        .plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init());

    builder
        .setup(|_app| {
            // Mobile-specific initialization handled by platform plugins
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Nexus HEMS Dashboard");
}
