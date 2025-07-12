import React, { useState, useEffect } from 'react';
import './SettingsPage.scss';

interface PermissionSettings {
  canWrite: boolean;      // Write files & TodoWrite
  canEdit: boolean;       // Edit & MultiEdit files
  canDelete: boolean;     // Delete files
  canRunBash: boolean;    // All Bash commands
  lastUpdated: number;
}

interface SettingsPageProps {
  onClose?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ onClose }) => {
  const [permissions, setPermissions] = useState<PermissionSettings>({
    canWrite: false,
    canEdit: false, 
    canDelete: false,
    canRunBash: false,
    lastUpdated: 0
  });

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('claudeToolsSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // Convert old format to new format if needed
        if (parsed.allowedTools) {
          setPermissions({
            canWrite: parsed.allowedTools.includes('Write') || parsed.allowedTools.includes('TodoWrite'),
            canEdit: parsed.allowedTools.includes('Edit') || parsed.allowedTools.includes('MultiEdit'),
            canDelete: parsed.allowedTools.includes('Delete') || parsed.allowedTools.includes('Remove'),
            canRunBash: parsed.allowedTools.includes('Bash'),
            lastUpdated: parsed.lastUpdated || Date.now()
          });
        } else {
          setPermissions(parsed);
        }
      } catch (error) {
        console.error('Error parsing saved settings:', error);
        setPermissions(getDefaultSettings());
      }
    } else {
      setPermissions(getDefaultSettings());
    }
  }, []);

  // Get default secure settings (all permissions disabled)
  const getDefaultSettings = (): PermissionSettings => ({
    canWrite: false,
    canEdit: false,
    canDelete: false,
    canRunBash: false,
    lastUpdated: Date.now()
  });

  // Convert new permission format to old format for server compatibility
  const convertToOldFormat = (permissions: PermissionSettings) => {
    const allowedTools = ['Read', 'LS', 'Grep', 'Glob', 'TodoRead', 'Task', 'WebFetch', 'WebSearch'];
    const disallowedTools: string[] = [];

    if (permissions.canWrite) {
      allowedTools.push('Write', 'TodoWrite');
    } else {
      disallowedTools.push('Write', 'TodoWrite');
    }

    if (permissions.canEdit) {
      allowedTools.push('Edit', 'MultiEdit');
    } else {
      disallowedTools.push('Edit', 'MultiEdit');
    }

    if (permissions.canDelete) {
      allowedTools.push('Delete', 'Remove');
      // Also allow specific Bash deletion commands when Delete permission is granted
      allowedTools.push('Bash(rm *)', 'Bash(rmdir *)', 'Bash(unlink *)');
    } else {
      disallowedTools.push('Delete', 'Remove');
    }

    if (permissions.canRunBash) {
      allowedTools.push('Bash');
    } else {
      // Block all Bash commands except those specifically allowed by Delete permission above
      disallowedTools.push('Bash', 'Bash(del *)', 'Bash(delete *)', 'Bash(erase *)', 'Bash(format *)', 'Bash(dd *)', 'Bash(sudo *)');
      
      // Only block rm/rmdir/unlink if Delete permission is also disabled
      if (!permissions.canDelete) {
        disallowedTools.push('Bash(rm *)', 'Bash(rmdir *)', 'Bash(unlink *)');
      }
    }

    return {
      allowedTools,
      disallowedTools,
      skipPermissions: false,
      lastUpdated: permissions.lastUpdated
    };
  };

  // Save settings to localStorage and sync to server
  const saveSettings = () => {
    setSaveStatus('saving');
    try {
      const updatedPermissions = {
        ...permissions,
        lastUpdated: Date.now()
      };
      
      // Save new format for UI
      localStorage.setItem('claudePermissions', JSON.stringify(updatedPermissions));
      
      // Save old format for server compatibility
      const oldFormatSettings = convertToOldFormat(updatedPermissions);
      localStorage.setItem('claudeToolsSettings', JSON.stringify(oldFormatSettings));
      
      setPermissions(updatedPermissions);
      
      // Send settings sync message to server through WebSocket
      window.dispatchEvent(new CustomEvent('settingsChanged', {
        detail: oldFormatSettings
      }));
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // Toggle permission functions
  const togglePermission = (permission: keyof Omit<PermissionSettings, 'lastUpdated'>) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }));
  };

  const resetToDefaults = () => {
    if (confirm('Reset all permissions to secure defaults? All dangerous operations will be disabled.')) {
      setPermissions(getDefaultSettings());
    }
  };

  const getSaveButtonText = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...';
      case 'saved': return 'Saved!';
      case 'error': return 'Error!';
      default: return 'Save Settings';
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <div className="header-content">
            <button className="close-btn" onClick={onClose} aria-label="Close settings">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <h1 className="header-title">
              <svg className="header-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.2579 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.3766 5.705 20.3766C5.44217 20.3766 5.18192 20.3248 4.93912 20.2241C4.69632 20.1235 4.47575 19.976 4.29 19.79C4.10405 19.6043 3.95653 19.3837 3.85588 19.1409C3.75523 18.8981 3.70343 18.6378 3.70343 18.375C3.70343 18.1122 3.75523 17.8519 3.85588 17.6091C3.95653 17.3663 4.10405 17.1457 4.29 16.96L4.35 16.9C4.58054 16.6643 4.73519 16.365 4.794 16.0406C4.85282 15.7162 4.81312 15.3816 4.68 15.08C4.55324 14.7842 4.34276 14.532 4.07447 14.3543C3.80618 14.1766 3.49179 14.0813 3.17 14.08H3C2.46957 14.08 1.96086 13.8693 1.58579 13.4942C1.21071 13.1191 1 12.6104 1 12.08C1 11.5496 1.21071 11.0409 1.58579 10.6658C1.96086 10.2907 2.46957 10.08 3 10.08H3.09C3.42099 10.0723 3.742 9.96512 4.01127 9.77251C4.28054 9.5799 4.48571 9.31074 4.6 9C4.73312 8.69838 4.77282 8.36381 4.714 8.03941C4.65519 7.71502 4.50054 7.41568 4.27 7.18L4.21 7.12C4.02405 6.93425 3.87653 6.71368 3.77588 6.47088C3.67523 6.22808 3.62343 5.96783 3.62343 5.705C3.62343 5.44217 3.67523 5.18192 3.77588 4.93912C3.87653 4.69632 4.02405 4.47575 4.21 4.29C4.39575 4.10405 4.61632 3.95653 4.85912 3.85588C5.10192 3.75523 5.36217 3.70343 5.625 3.70343C5.88783 3.70343 6.14808 3.75523 6.39088 3.85588C6.63368 3.87653 6.85425 4.02405 7.04 4.29L7.1 4.35C7.33568 4.58054 7.63502 4.73519 7.95941 4.794C8.28381 4.85282 8.61838 4.81312 8.92 4.68H9C9.29577 4.55324 9.54802 4.34276 9.72569 4.07447C9.90337 3.80618 9.99872 3.49179 10 3.17V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
              Claude Permissions
            </h1>
            <p className="header-subtitle">Configure what Claude can do in your projects</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="settings-content">
          {/* Info Alert */}
          <div className="info-alert">
            <svg className="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16V12M12 8H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div className="info-content">
              <strong>Read permissions are always enabled</strong> when you open a project. This includes analyzing files, viewing code, and accessing project structure.
            </div>
          </div>

          {/* Permission Categories */}
          <div className="permissions-grid">
            {/* Write Permission */}
            <div className="permission-card">
              <div className="permission-header">
                <div className="permission-icon write-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M18.5 2.5C18.8978 2.10217 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10217 21.5 2.5C21.8978 2.89783 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10217 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="permission-info">
                  <h3>Write Files</h3>
                  <p>Create new files and save content to your project</p>
                </div>
                <div className="permission-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={permissions.canWrite}
                      onChange={() => togglePermission('canWrite')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* Edit Permission */}
            <div className="permission-card">
              <div className="permission-header">
                <div className="permission-icon edit-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16.5 3.5C16.8978 3.10218 17.4374 2.87868 18 2.87868C18.5626 2.87868 19.1022 3.10218 19.5 3.5C19.8978 3.89782 20.1213 4.43739 20.1213 5C20.1213 5.56261 19.8978 6.10218 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="permission-info">
                  <h3>Edit Files</h3>
                  <p>Modify existing files and update code</p>
                </div>
                <div className="permission-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={permissions.canEdit}
                      onChange={() => togglePermission('canEdit')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* Delete Permission */}
            <div className="permission-card">
              <div className="permission-header">
                <div className="permission-icon delete-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="permission-info">
                  <h3>Delete Files</h3>
                  <p>Remove files and folders from your project</p>
                </div>
                <div className="permission-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={permissions.canDelete}
                      onChange={() => togglePermission('canDelete')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* Bash Permission */}
            <div className="permission-card">
              <div className="permission-header">
                <div className="permission-icon bash-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                    <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M6 7L8 9L6 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="10" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="permission-info">
                  <h3>Run Commands</h3>
                  <p>Execute terminal commands and scripts</p>
                </div>
                <div className="permission-toggle">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={permissions.canRunBash}
                      onChange={() => togglePermission('canRunBash')}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="settings-actions">
            <button
              onClick={resetToDefaults}
              className="btn btn-secondary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M1 4V10H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.51 15C4.13 16.44 5.14 17.67 6.41 18.54C7.68 19.41 9.17 19.89 10.7 19.93C12.23 19.96 13.74 19.55 15.07 18.74C16.4 17.93 17.5 16.76 18.22 15.36C18.94 13.96 19.24 12.38 19.07 10.82C18.9 9.26 18.27 7.78 17.25 6.56C16.23 5.34 14.87 4.43 13.35 3.94C11.83 3.45 10.2 3.4 8.66 3.79" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Reset to Defaults
            </button>
            
            <button
              onClick={saveSettings}
              className={`btn btn-primary ${saveStatus}`}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' && (
                <div className="spinner"></div>
              )}
              {saveStatus === 'saved' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {saveStatus === 'error' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2"/>
                  <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
                </svg>
              )}
              {saveStatus === 'idle' && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="17,21 17,13 7,13 7,21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="7,3 7,8 15,8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {getSaveButtonText()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;