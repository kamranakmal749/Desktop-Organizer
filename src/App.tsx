import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import './App.css';

// TypeScript interface matching the Rust UnorganizedFile struct
export interface UnorganizedFile {
  file_name: string;
  file_path: string;
  file_extension: string;
  file_size: number;
  category: string;
}

// Interface matching Rust FileMove struct
export interface FileMove {
  original_path: string;
  new_path: string;
  category: string;
}

// Interface matching Rust OrganizeResponse struct
export interface OrganizeResponse {
  message: string;
  dry_run: boolean;
  file_moves: FileMove[];
}

function App() {
  const [files, setFiles] = useState<UnorganizedFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [organizing, setOrganizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [useNestedFolder, setUseNestedFolder] = useState(true);
  const [previewMoves, setPreviewMoves] = useState<FileMove[]>([]);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch files when targetFolder changes
  useEffect(() => {
    async function fetchUnorganizedFiles() {
      try {
        setLoading(true);
        setStatusMessage(null);
        setPreviewMoves([]);
        const result = await invoke<UnorganizedFile[]>('get_unorganized_files', {
          targetPath: targetFolder,
        });
        setFiles(result);
      } catch (error) {
        console.error('Failed to fetch unorganized files:', error);
        setStatusMessage(`Error: ${error}`);
      } finally {
        setLoading(false);
      }
    }

    fetchUnorganizedFiles();
  }, [targetFolder]);

  // Open native folder picker
  const handleBrowse = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setTargetFolder(selected);
        setSelectedFiles(new Set());
        setUndoAvailable(false);
      }
    } catch (error) {
      console.error('Folder picker failed:', error);
    }
  }, []);

  // Derived metrics
  const totalFiles = files.length;

  const totalSizeMB = useMemo(() => {
    if (selectedFiles.size === 0) return 0;
    const total = files
      .filter((f) => selectedFiles.has(f.file_path))
      .reduce((sum, f) => sum + f.file_size, 0);
    return Math.round(total * 100) / 100;
  }, [files, selectedFiles]);

  const selectedCount = selectedFiles.size;

  // Handlers
  const toggleFile = useCallback((filePath: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  // Filtered list based on search query (case-insensitive, matches name or extension)
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase().trim();
    return files.filter((f) =>
      f.file_name.toLowerCase().includes(q) ||
      f.file_extension.toLowerCase().includes(q)
    );
  }, [files, searchQuery]);

  const toggleAll = useCallback(() => {
    setSelectedFiles((prev) => {
      const allFilteredSelected = filteredFiles.every((f) => prev.has(f.file_path));
      if (allFilteredSelected) {
        // Deselect only filtered files, keep others selected
        const next = new Set(prev);
        for (const f of filteredFiles) {
          next.delete(f.file_path);
        }
        return next;
      }
      // Select all filtered files, keep others selected
      const next = new Set(prev);
      for (const f of filteredFiles) {
        next.add(f.file_path);
      }
      return next;
    });
  }, [filteredFiles]);

  const isSelected = useCallback(
    (filePath: string) => selectedFiles.has(filePath),
    [selectedFiles]
  );

  const allSelected = useMemo(
    () => filteredFiles.length > 0 && filteredFiles.every((f) => selectedFiles.has(f.file_path)),
    [filteredFiles, selectedFiles]
  );

  const handleCleanFolder = useCallback(async () => {
    if (selectedFiles.size === 0) return;

    if (!dryRun) {
      const confirmed = window.confirm(
        `Are you sure you want to organize ${selectedFiles.size} file(s)? This will move files into category folders.`
      );
      if (!confirmed) return;
    }

    try {
      setOrganizing(true);
      setStatusMessage(null);
      setPreviewMoves([]);

      const response = await invoke<OrganizeResponse>('execute_organization', {
        request: {
          target_path: targetFolder,
          selected_files: [...selectedFiles],
          dry_run: dryRun,
          use_nested_folder: useNestedFolder,
        },
      });

      setStatusMessage(response.message);

      if (response.dry_run) {
        // Store preview moves for display
        setPreviewMoves(response.file_moves);
        setSelectedFiles(new Set());
      } else {
        // Real organization completed
        setSelectedFiles(new Set());
        setUndoAvailable(true);

        // Refresh the file list
        const result = await invoke<UnorganizedFile[]>('get_unorganized_files', {
          targetPath: targetFolder,
        });
        setFiles(result);
      }
    } catch (error) {
      console.error('Organization failed:', error);
      setStatusMessage(`Error: ${error}`);
    } finally {
      setOrganizing(false);
    }
  }, [selectedFiles, targetFolder, dryRun, useNestedFolder]);

  const handleUndo = useCallback(async () => {
    try {
      setOrganizing(true);
      setStatusMessage(null);

      const message = await invoke<string>('revert_organization', {
        targetPath: targetFolder,
      });

      setStatusMessage(message);
      setUndoAvailable(false);

      // Refresh the file list
      const result = await invoke<UnorganizedFile[]>('get_unorganized_files', {
        targetPath: targetFolder,
      });
      setFiles(result);
    } catch (error) {
      console.error('Revert failed:', error);
      setStatusMessage(`Error: ${error}`);
    } finally {
      setOrganizing(false);
    }
  }, [targetFolder]);

  // Build a lookup map from file_path to preview move for the table rows
  const previewMap = useMemo(() => {
    const map = new Map<string, FileMove>();
    for (const move of previewMoves) {
      map.set(move.original_path, move);
    }
    return map;
  }, [previewMoves]);

  // Compute category breakdown from all discovered files (using backend-provided categories)
  const categoryBreakdown = useMemo(() => {
    const categories = ['Documents', 'Images', 'Videos', 'Audio', 'Archives', 'Executables', 'Shortcuts', 'Code', 'Others'];
    const sizes: Record<string, number> = {};
    for (const cat of categories) sizes[cat] = 0;

    let totalSize = 0;
    for (const file of files) {
      const cat = file.category;
      if (cat in sizes) {
        sizes[cat] += file.file_size;
      } else {
        sizes['Others'] += file.file_size;
      }
      totalSize += file.file_size;
    }

    // Round each
    for (const cat of categories) {
      sizes[cat] = Math.round(sizes[cat] * 100) / 100;
    }
    totalSize = Math.round(totalSize * 100) / 100;

    return { sizes, totalSize, categories };
  }, [files]);

  // Monochrome palette for category breakdown bar
  const categoryColors: Record<string, string> = {
    Documents:   '#1A1A1A',  // Deep charcoal
    Images:      '#3A3A3A',  // Dark gray
    Videos:      '#5A5A5A',  // Mid-dark gray
    Audio:       '#7A7A7A',  // Mid gray
    Archives:    '#9A9A9A',  // Light-mid gray
    Executables: '#BABABA',  // Light gray
    Shortcuts:   '#D5D5D5',  // Pale gray
    Code:        '#E8E8E8',  // Near-white
    Others:      '#F0F0F0',  // Almost white
  };

  // Format helpers
  const formatFileSize = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  // Display path for the header
  const isDesktop = targetFolder.replace(/[/\\]/g, '\\').toLowerCase().endsWith('\\desktop')
    && !targetFolder.replace(/[/\\]/g, '\\').toLowerCase().includes('\\public\\desktop');
  const displayPath = loading
    ? 'Scanning...'
    : targetFolder
      ? (isDesktop ? `${targetFolder} (+ Public Desktop)` : targetFolder)
      : 'Default Downloads folder';

  return (
    <div className="app-container">
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header animate-entrance anim-delay-0">
        <div className="header-left">
          <h1>Desktop Organizer</h1>
          <div className="path-row">
            <p className="subtitle">{displayPath}</p>
            <button className="btn-browse" onClick={handleBrowse} title="Browse for a folder">
              📁 Browse Folder
            </button>
          </div>
        </div>
        <div className="header-actions">
          {/* Nesting Toggle */}
          <label className="dry-run-toggle" title="When enabled, category folders are nested inside a 'Sorted Workspace' folder">
            <span className="toggle-label">📁 Nest in Folder</span>
            <div className={`toggle-switch nesting ${useNestedFolder ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={useNestedFolder}
                onChange={(e) => setUseNestedFolder(e.target.checked)}
                aria-label="Toggle nested folder mode"
              />
              <span className="toggle-slider" />
            </div>
          </label>
          {/* Dry Run Toggle */}
          <label className="dry-run-toggle" title="Preview changes without moving files">
            <span className="toggle-label">🔬 Dry Run</span>
            <div className={`toggle-switch ${dryRun ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                aria-label="Toggle dry run mode"
              />
              <span className="toggle-slider" />
            </div>
          </label>
          <button
            className={`btn-clean ${dryRun ? 'btn-preview' : ''}`}
            disabled={selectedCount === 0 || organizing}
            onClick={handleCleanFolder}
          >
            {dryRun ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {organizing ? 'Previewing...' : '🔍 Preview Organization'}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
                {organizing ? 'Organizing...' : 'Clean Folder'}
              </>
            )}
          </button>
        </div>
      </header>

      {/* Status Message */}
      {statusMessage && (
        <div className={`status-banner ${statusMessage.startsWith('Error') ? 'error' : 'success'}`}>
          <span>{statusMessage}</span>
          {undoAvailable && !statusMessage.startsWith('Error') && (
            <button className="btn-undo" onClick={handleUndo} disabled={organizing}>
              ↩️ Undo / Revert
            </button>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <section className="summary-grid animate-entrance anim-delay-100">
        <div className="summary-card">
          <div className="card-icon files">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <div className="card-body">
            <h3>Files Found</h3>
            <div className="value">
              {loading ? '—' : totalFiles}
              <span className="unit">files</span>
            </div>
          </div>
        </div>

        <div className="summary-card dark">
          <div className="card-icon space">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="card-body">
            <h3>Recoverable Space</h3>
            <div className="value">
              {loading ? '—' : formatFileSize(totalSizeMB)}
            </div>
          </div>
        </div>
      </section>

      {/* Category Breakdown Donut Chart */}
      {!loading && files.length > 0 && categoryBreakdown.totalSize > 0 && (
        <section className="breakdown-section animate-entrance anim-delay-200">
          <div className="breakdown-header">
            <h3>📊 Storage Breakdown</h3>
            <span className="breakdown-total">{formatFileSize(categoryBreakdown.totalSize)} total</span>
          </div>
          <div className="breakdown-content">
            {/* Vertical Legend */}
            <div className="breakdown-legend">
              {categoryBreakdown.categories.map((cat) => {
                const pct = categoryBreakdown.totalSize > 0
                  ? (categoryBreakdown.sizes[cat] / categoryBreakdown.totalSize) * 100
                  : 0;
                if (categoryBreakdown.sizes[cat] === 0) return null;
                return (
                  <div key={cat} className="legend-item">
                    <span
                      className="legend-dot"
                      style={{ backgroundColor: categoryColors[cat] }}
                    />
                    <span className="legend-label">{cat}</span>
                    <span className="legend-size">{formatFileSize(categoryBreakdown.sizes[cat])}</span>
                    <span className="legend-pct">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>

            {/* Donut Chart */}
            <div className="donut-container">
              <svg className="donut-chart" viewBox="0 0 100 100">
                {/* Background track */}
                <circle
                  cx="50" cy="50" r="40"
                  stroke="#F0F0F0"
                  fill="transparent"
                  strokeWidth="10"
                />
                {/* Stacked segments - calculate cumulative dashoffset */}
                {(() => {
                  const circumference = 2 * Math.PI * 40; // ~251.2
                  let cumulativeOffset = 0;
                  const activeCategories = categoryBreakdown.categories.filter(
                    (cat) => categoryBreakdown.sizes[cat] > 0
                  );
                  return activeCategories.map((cat, idx) => {
                    const pct = (categoryBreakdown.sizes[cat] / categoryBreakdown.totalSize) * 100;
                    const segmentLength = (pct / 100) * circumference;
                    const offset = -cumulativeOffset;
                    cumulativeOffset += segmentLength;
                    return (
                      <circle
                        key={cat}
                        cx="50" cy="50" r="40"
                        stroke={categoryColors[cat]}
                        fill="transparent"
                        strokeWidth="10"
                        strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                        strokeDashoffset={offset}
                        strokeLinecap="butt"
                        className="donut-ring-animate"
                        style={{ animationDelay: `${idx * 120}ms` }}
                      />
                    );
                  });
                })()}
              </svg>
              <div className="donut-center">
                <span className="donut-value">{formatFileSize(categoryBreakdown.totalSize)}</span>
                <span className="donut-label">Total</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="spinner" />
          <p>Scanning folder...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && files.length === 0 && previewMoves.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p>No files found in the selected folder.</p>
        </div>
      )}

      {/* Preview Results Table */}
      {previewMoves.length > 0 && (
        <section className="preview-section">
          <div className="preview-header">
            <h3>📋 Preview — File Organization Plan</h3>
            <span className="preview-count">{previewMoves.length} file(s) will be organized</span>
          </div>
          <div className="table-container">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="name-col">Name</th>
                    <th className="ext-col">Type</th>
                    <th className="dest-col">Destination Category</th>
                  </tr>
                </thead>
                <tbody>
                  {previewMoves.map((move) => {
                    const path = move.original_path;
                    const fileName = path.split('\\').pop()?.split('/').pop() || path;
                    const ext = fileName.includes('.')
                      ? fileName.split('.').pop() || ''
                      : '';
                    return (
                      <tr key={move.original_path}>
                        <td className="name-col" title={fileName}>
                          {fileName}
                        </td>
                        <td className="ext-col">.{ext.toLowerCase()}</td>
                        <td className="dest-col">
                          <span className="category-badge">{move.category}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Search Bar */}
      {!loading && files.length > 0 && (
        <div className="search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search files by name or extension..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Data Table */}
      {!loading && files.length > 0 && (
        <section className="table-container animate-entrance anim-delay-300">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check-col">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all files"
                    />
                  </th>
                  <th className="name-col">Name</th>
                  <th className="ext-col">Type</th>
                  <th className="size-col">Size</th>
                  <th className="path-col">Path</th>
                  {dryRun && <th className="dest-col">Will Move To</th>}
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const preview = previewMap.get(file.file_path);
                  return (
                    <tr key={file.file_path} className={preview ? 'preview-row' : ''}>
                      <td className="check-col">
                        <input
                          type="checkbox"
                          checked={isSelected(file.file_path)}
                          onChange={() => toggleFile(file.file_path)}
                          aria-label={`Select ${file.file_name}`}
                        />
                      </td>
                      <td className="name-col" title={file.file_name}>
                        {file.file_name}
                      </td>
                      <td className="ext-col">.{file.file_extension}</td>
                      <td className="size-col">{formatFileSize(file.file_size)}</td>
                      <td className="path-col" title={file.file_path}>
                        {file.file_path}
                      </td>
                      {dryRun && (
                        <td className="dest-col">
                          {preview ? (
                            <span className="category-badge">{preview.category}</span>
                          ) : (
                            <span className="category-badge not-selected">Not selected</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              Showing <strong>{filteredFiles.length}</strong> file{filteredFiles.length !== 1 ? 's' : ''}
              {searchQuery && filteredFiles.length !== files.length && (
                <> (filtered from <strong>{files.length}</strong>)</>
              )}
            </span>
            <span className="selected-count">
              {selectedCount > 0 && (
                <>
                  <strong>{selectedCount}</strong> selected
                </>
              )}
            </span>
          </div>
        </section>
      )}
    </div>
    </div>
  );
}

export default App;
