use super::shell_detect::{self, ShellInfo};

/// Get the list of available shells on this system.
pub fn list_shells() -> Vec<ShellInfo> {
    shell_detect::detect_shells()
}

/// Get the default shell for new terminals.
pub fn default_shell() -> ShellInfo {
    shell_detect::get_default_shell()
}
