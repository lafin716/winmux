#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = winmux_lib::daemon::run() {
        eprintln!("winmuxd failed: {e}");
        std::process::exit(1);
    }
}
