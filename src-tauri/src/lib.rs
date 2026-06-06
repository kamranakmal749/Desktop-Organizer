use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct UnorganizedFile {
    pub file_name: String,
    pub file_path: String,
    pub file_extension: String,
    pub file_size: f64,
}

#[tauri::command]
async fn get_unorganized_files(target_path: String) -> Result<Vec<UnorganizedFile>, String> {
    let scan_path = if target_path.is_empty() {
        get_downloads_folder()?
    } else {
        let p = PathBuf::from(&target_path);
        if !p.exists() {
            return Err(format!("The specified path does not exist: {}", target_path));
        }
        if !p.is_dir() {
            return Err(format!("The specified path is not a directory: {}", target_path));
        }
        p
    };

    let entries = fs::read_dir(&scan_path)
        .map_err(|e| format!("Failed to read folder: {}", e))?;

    let mut files: Vec<UnorganizedFile> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        // Skip directories
        if path.is_dir() {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let file_extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        let file_size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

        // Convert bytes to MB (1 MB = 1,048,576 bytes)
        let file_size = (file_size_bytes as f64) / 1_048_576.0;
        // Round to 2 decimal places
        let file_size = (file_size * 100.0).round() / 100.0;

        files.push(UnorganizedFile {
            file_name,
            file_path: path.to_string_lossy().to_string(),
            file_extension,
            file_size,
        });
    }

    // Sort by file_name for consistent ordering
    files.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));

    Ok(files)
}

#[derive(Debug, Deserialize)]
pub struct OrganizeRequest {
    pub target_path: String,
    pub selected_files: Vec<String>,
    pub dry_run: bool,
    pub use_nested_folder: bool,
}

/// Represents a single file move operation (used for dry-run results and history).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMove {
    pub original_path: String,
    pub new_path: String,
    pub category: String,
}

/// Response returned by execute_organization.
#[derive(Debug, Serialize)]
pub struct OrganizeResponse {
    pub message: String,
    pub dry_run: bool,
    pub file_moves: Vec<FileMove>,
}

/// History file format stored inside Organized_Files.
#[derive(Debug, Serialize, Deserialize)]
pub struct OrganizationHistory {
    pub target_path: String,
    pub file_moves: Vec<FileMove>,
}

fn categorize_file(extension: &str) -> &'static str {
    match extension {
        // Documents
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "rtf"
        | "odt" | "ods" | "odp" | "csv" | "md" => "Documents",
        // Images
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "svg" | "webp" | "ico" | "tiff"
        | "tif" | "avif" => "Images",
        // Videos
        "mp4" | "avi" | "mkv" | "mov" | "wmv" | "flv" | "webm" | "m4v" => "Videos",
        // Audio
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "wma" | "m4a" => "Audio",
        // Archives
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "iso" => "Archives",
        // Executables
        "exe" | "msi" | "dmg" | "pkg" | "sh" | "bat" | "cmd" | "ps1" => "Executables",
        // Code files
        "js" | "ts" | "jsx" | "tsx" | "py" | "rs" | "go" | "java" | "c" | "cpp"
        | "h" | "hpp" | "css" | "scss" | "html" | "json" | "xml" | "yaml" | "yml"
        | "toml" | "sql" | "rb" | "php" | "swift" | "kt" => "Code",
        _ => "Others",
    }
}

/// Resolve the destination path for a file inside a category folder, handling collisions.
fn resolve_dest_path(category_dir: &PathBuf, file_path: &PathBuf) -> PathBuf {
    let file_name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let dest_path = category_dir.join(&file_name);

    if dest_path.exists() {
        let stem = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        let ext = if extension.is_empty() {
            String::new()
        } else {
            format!(".{}", extension)
        };
        let mut counter = 1;
        loop {
            let new_name = format!("{} ({}){}", stem, counter, ext);
            let new_path = category_dir.join(&new_name);
            if !new_path.exists() {
                return new_path;
            }
            counter += 1;
        }
    } else {
        dest_path
    }
}

#[tauri::command]
async fn execute_organization(request: OrganizeRequest) -> Result<OrganizeResponse, String> {
    let base = if request.target_path.is_empty() {
        get_downloads_folder()?
    } else {
        let p = PathBuf::from(&request.target_path);
        if !p.exists() {
            return Err(format!("Target folder does not exist: {}", request.target_path));
        }
        if !p.is_dir() {
            return Err(format!("The specified path is not a directory: {}", request.target_path));
        }
        p
    };

    // Determine the root directory for organized files
    // If use_nested_folder is true, nest inside "Sorted Workspace"
    // If false, create category folders directly in the target root
    let organized_root = if request.use_nested_folder {
        base.join("Sorted Workspace")
    } else {
        base.clone()
    };

    // Compute all file moves first
    let mut file_moves: Vec<FileMove> = Vec::new();
    let mut category_dirs_needed: HashMap<String, bool> = HashMap::new();

    for file_path_str in &request.selected_files {
        let file_path = PathBuf::from(file_path_str);
        if !file_path.exists() {
            continue;
        }

        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let category = categorize_file(&extension);
        let category_dir = organized_root.join(category);

        // Resolve the final destination (handles collisions)
        let dest_path = resolve_dest_path(&category_dir, &file_path);

        category_dirs_needed.insert(category.to_string(), true);

        file_moves.push(FileMove {
            original_path: file_path.to_string_lossy().to_string(),
            new_path: dest_path.to_string_lossy().to_string(),
            category: category.to_string(),
        });
    }

    if request.dry_run {
        return Ok(OrganizeResponse {
            message: format!(
                "Dry run: {} file(s) would be organized into '{}'",
                file_moves.len(),
                organized_root.display()
            ),
            dry_run: true,
            file_moves,
        });
    }

    // --- Real organization ---

    // Create the organized root directory
    fs::create_dir_all(&organized_root)
        .map_err(|e| format!("Failed to create organized root directory: {}", e))?;

    // Create needed category directories
    for category in category_dirs_needed.keys() {
        let cat_dir = organized_root.join(category);
        fs::create_dir_all(&cat_dir)
            .map_err(|e| format!("Failed to create directory '{}': {}", category, e))?;
    }

    // Move files
    let mut moved_count = 0u32;
    for fm in &file_moves {
        let src = PathBuf::from(&fm.original_path);
        let dst = PathBuf::from(&fm.new_path);
        fs::rename(&src, &dst)
            .map_err(|e| format!("Failed to move '{}': {}", fm.original_path, e))?;
        moved_count += 1;
    }

    // Write history file
    let history = OrganizationHistory {
        target_path: base.to_string_lossy().to_string(),
        file_moves: file_moves.clone(),
    };
    let history_path = organized_root.join("history.json");
    let history_json = serde_json::to_string_pretty(&history)
        .map_err(|e| format!("Failed to serialize history: {}", e))?;
    fs::write(&history_path, history_json)
        .map_err(|e| format!("Failed to write history file: {}", e))?;

    Ok(OrganizeResponse {
        message: format!(
            "Successfully organized {} file(s) into '{}'",
            moved_count,
            organized_root.display()
        ),
        dry_run: false,
        file_moves,
    })
}

#[tauri::command]
async fn revert_organization(target_path: String) -> Result<String, String> {
    let base = if target_path.is_empty() {
        get_downloads_folder()?
    } else {
        let p = PathBuf::from(&target_path);
        if !p.exists() {
            return Err(format!("Target folder does not exist: {}", target_path));
        }
        if !p.is_dir() {
            return Err(format!("The specified path is not a directory: {}", target_path));
        }
        p
    };

    // Dynamically locate history.json:
    // 1. Check inside "Sorted Workspace" subfolder (nested mode)
    // 2. If not found, check directly in the target root (flat mode)
    let (organized_root, history_path) = {
        let nested = base.join("Sorted Workspace");
        let nested_history = nested.join("history.json");
        if nested_history.exists() {
            (nested, nested_history)
        } else {
            let flat_history = base.join("history.json");
            if flat_history.exists() {
                (base.clone(), flat_history)
            } else {
                return Err("No history file found. Nothing to revert.".to_string());
            }
        }
    };

    // Read and parse history
    let history_content = fs::read_to_string(&history_path)
        .map_err(|e| format!("Failed to read history file: {}", e))?;
    let history: OrganizationHistory = serde_json::from_str(&history_content)
        .map_err(|e| format!("Failed to parse history file: {}", e))?;

    if history.file_moves.is_empty() {
        // Remove empty history and folder
        let _ = fs::remove_file(&history_path);
        let _ = fs::remove_dir(&organized_root);
        return Ok("Nothing to revert.".to_string());
    }

    // Track which category dirs had files moved out of them
    let mut affected_categories: HashMap<String, bool> = HashMap::new();
    let mut reverted_count = 0u32;

    // Iterate in reverse order to undo moves
    for fm in history.file_moves.iter().rev() {
        let src = PathBuf::from(&fm.new_path);
        let dst = PathBuf::from(&fm.original_path);

        if !src.exists() {
            continue;
        }

        // Ensure the parent directory of the original path exists
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        fs::rename(&src, &dst)
            .map_err(|e| format!("Failed to revert '{}': {}", fm.new_path, e))?;

        affected_categories.insert(fm.category.clone(), true);
        reverted_count += 1;
    }

    // Remove empty category directories
    for category in affected_categories.keys() {
        let cat_dir = organized_root.join(category);
        let _ = fs::remove_dir(&cat_dir);
    }

    // Remove history file
    let _ = fs::remove_file(&history_path);

    // Remove Sorted Workspace root if empty (only for nested mode)
    if organized_root != base {
        let _ = fs::remove_dir(&organized_root);
    }

    Ok(format!(
        "Successfully reverted {} file(s) back to their original locations.",
        reverted_count
    ))
}

fn get_downloads_folder() -> Result<PathBuf, String> {
    // Use the native Windows known folder API via environment variable
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let downloads = PathBuf::from(&profile).join("Downloads");
        if downloads.exists() {
            return Ok(downloads);
        }
    }

    // Fallback: try the OneDrive Downloads path
    if let Ok(one_drive) = std::env::var("OneDrive") {
        let downloads = PathBuf::from(&one_drive).join("Downloads");
        if downloads.exists() {
            return Ok(downloads);
        }
    }

    // Final fallback
    Err("Could not locate Downloads folder".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_unorganized_files,
            execute_organization,
            revert_organization
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
