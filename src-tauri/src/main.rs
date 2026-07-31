use std::{
    net::{TcpListener, TcpStream},
    sync::Mutex,
    thread,
    time::Duration,
};

use tauri::{
    Manager, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_shell::{process::CommandChild, ShellExt};

struct EngineState(Mutex<Option<CommandChild>>);

fn free_local_port() -> Result<u16, std::io::Error> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let port = free_local_port()?;
            let (_events, child) = app
                .shell()
                .sidecar("audra-engine")?
                .env("AUDRA_HOST", "127.0.0.1")
                .env("AUDRA_PORT", port.to_string())
                .spawn()?;

            app.manage(EngineState(Mutex::new(Some(child))));
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let address = format!("127.0.0.1:{port}");
                for _ in 0..240 {
                    if TcpStream::connect(&address).is_ok() {
                        let url = format!("http://127.0.0.1:{port}/workspace")
                            .parse()
                            .expect("valid local Audra URL");
                        let window_app_handle = app_handle.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            let _ = WebviewWindowBuilder::new(
                                &window_app_handle,
                                "main",
                                WebviewUrl::External(url),
                            )
                            .title("Audra Technology — Beat-to-Video Engine")
                            .inner_size(1280.0, 820.0)
                            .min_inner_size(1024.0, 720.0)
                            .resizable(true)
                            .build();
                        });
                        return;
                    }
                    thread::sleep(Duration::from_millis(125));
                }
                eprintln!("Audra engine did not become ready within 30 seconds.");
                app_handle.exit(1);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Audra Tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            if let Some(state) = app_handle.try_state::<EngineState>() {
                if let Ok(mut child) = state.0.lock() {
                    if let Some(child) = child.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
