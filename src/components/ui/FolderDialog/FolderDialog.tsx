import React, { useState } from 'react';
import './FolderDialog.scss';

interface FolderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (folderPath: string, projectName: string) => void;
}

const FolderDialog: React.FC<FolderDialogProps> = ({ isOpen, onClose, onConfirm }) => {
  const [folderPath, setFolderPath] = useState('');
  const [projectName, setProjectName] = useState('');

  const handleSelectFolder = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const directoryHandle = await (window as any).showDirectoryPicker();
        setFolderPath(directoryHandle.name);
        if (!projectName) {
          setProjectName(directoryHandle.name);
        }
      } catch (error) {
        console.error('Folder selection cancelled or failed:', error);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          const path = files[0].webkitRelativePath.split('/')[0];
          setFolderPath(path);
          if (!projectName) {
            setProjectName(path);
          }
        }
      };
      input.click();
    }
  };

  const handleConfirm = () => {
    console.log('Form submitted:', { folderPath, projectName });
    if (folderPath && projectName) {
      onConfirm(folderPath, projectName);
      setFolderPath('');
      setProjectName('');
      onClose();
    } else {
      console.log('Missing required fields:', { folderPath, projectName });
    }
  };

  const handleCancel = () => {
    setFolderPath('');
    setProjectName('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="folder-dialog-overlay">
      <div className="folder-dialog">
        <div className="folder-dialog__header">
          <h2>Create New Project</h2>
          <button className="folder-dialog__close" onClick={handleCancel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <div className="folder-dialog__content">
          <div className="folder-dialog__field">
            <label htmlFor="projectName">Project Name</label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
            />
          </div>
          
          <div className="folder-dialog__field">
            <label htmlFor="folderPath">Project Folder</label>
            <div className="folder-dialog__folder-selector">
              <input
                id="folderPath"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="Type or select project folder path"
              />
              <button className="folder-dialog__browse-btn" onClick={handleSelectFolder}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H20C21.1046 20 22 19.1046 22 18V8C22 6.89543 21.1046 6 20 6H12L10 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Browse
              </button>
            </div>
          </div>
          
          <div className="folder-dialog__info">
            <p>Type the full path to your project folder or click Browse to select it. This will be used as the working directory for Claude.</p>
          </div>
        </div>
        
        <div className="folder-dialog__footer">
          <button className="folder-dialog__btn folder-dialog__btn--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button 
            className="folder-dialog__btn folder-dialog__btn--primary" 
            onClick={handleConfirm}
            disabled={!folderPath || !projectName}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default FolderDialog;