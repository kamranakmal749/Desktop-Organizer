# 🗂️ Desktop Organizer

A sleek, modern desktop application that scans your cluttered folders and intelligently organizes files into categorized subdirectories — all with a beautiful dark-theme dashboard.

Built with **Tauri v2**, **React**, **TypeScript**, and **Rust**, Desktop Organizer gives you full control over how your files are sorted, with preview mode, undo support, and a visual storage breakdown.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **🔍 File Search & Filter** | Instantly search through discovered files by name or extension with live, case-insensitive filtering. "Check All" operates only on visible (filtered) results. |
| **📊 Storage Breakdown** | A multi-colored horizontal progress bar with legend showing exactly how much space each file category (Documents, Images, Videos, etc.) consumes. |
| **🔬 Dry Run / Preview Mode** | Toggle preview mode to see exactly where files *would* be moved before committing any changes. |
| **↩️ Undo / Revert** | Every organization is recorded in a `history.json` file. One click restores all files to their original locations. |
| **📁 Nesting Toggle** | Choose whether category folders are nested inside a "Sorted Workspace" folder or created directly in the target root. |
| **📂 Smart Categorization** | Files are automatically sorted into 8 categories — Documents, Images, Videos, Audio, Archives, Executables, Code, and Others — based on file extension. |
| **📎 Collision Handling** | If a file with the same name already exists in the destination, a numbered suffix (`(1)`, `(2)`, etc.) is appended automatically. |
| **🎯 Folder Picker** | Use the native Windows folder dialog to select any directory for scanning and organization. |
| **📏 File Size Formatting** | All file sizes are displayed in human-readable MB/GB format. |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop Framework** | [Tauri v2](https://v2.tauri.app/) |
| **Frontend** | React 19 + TypeScript |
| **Build Tool** | Vite 8 |
| **Backend** | Rust (with `tauri::command` IPC) |
| **Serialization** | Serde / Serde JSON |
| **Native Dialogs** | `@tauri-apps/plugin-dialog` |
| **Installer** | NSIS & MSI (Windows) |

---

## 📥 Download & Install

Pre-built installers are available in the [**Releases**](https://github.com/kamranakmal749/Desktop-Organizer/releases) section.

1. Go to the [Releases page](https://github.com/kamranakmal749/Desktop-Organizer/releases)
2. Download the latest `Desktop Organizer_0.1.0_x64-setup.exe` (NSIS installer)
3. Run the installer and follow the on-screen instructions

> **Note:** Windows may show a SmartScreen warning since the installer is not code-signed. Click **"More info"** → **"Run anyway"** to proceed.

---

## 📦 Building from Source

### Prerequisites

Before running the build commands, please ensure your system has the necessary dependencies installed based on your OS:

#### 🍏 macOS
Run the following command to install Xcode Command Line Tools:
```bash
xcode-select --install
```
*(Optional) Install Rust via rustup.rs if not already installed.*

#### 🐧 Linux (Debian/Ubuntu)
Install the core system dependencies required by Tauri v2:
```bash
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### 🪟 Windows
Ensure you have the following installed and configured:
* Node.js v18+
* Rust (Latest stable)
* Tauri v2 System Dependencies (WebView2 & MSVC Build Tools)

---

### Steps to Run & Build

Follow these steps to set up the project locally:

```bash
# 1. Clone the repository
git clone https://github.com/kamranakmal749/Desktop-Organizer.git
cd Desktop-Organizer

# 2. Install frontend dependencies
npm install

# 3. Run the app in development mode
npm run tauri dev

# 4. Build the production-ready application
npm run tauri build
```

The production installer binary will be generated inside:
`src-tauri/target/release/bundle/`

---

## 📁 Project Structure

```
desktop-organizer/
├── src/                    # React frontend
│   ├── App.tsx             # Main application component
│   ├── App.css             # Application styles
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles / CSS variables
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands & business logic
│   │   └── main.rs         # Application entry point
│   ├── Cargo.toml          # Rust dependencies
│   └── tauri.conf.json     # Tauri configuration
├── package.json            # Node dependencies & scripts
└── .gitignore              # Git ignore rules
```

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

*Made with ❤️ using Tauri, React, and Rust*
