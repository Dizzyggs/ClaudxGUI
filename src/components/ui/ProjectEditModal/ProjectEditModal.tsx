import React, { useState, useEffect } from 'react';
import './ProjectEditModal.scss';

interface Project {
  id: string;
  name: string;
  path?: string;
}

interface ProjectEditModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onConfirm: (projectId: string, newName: string, newPath: string) => void;
}

const ProjectEditModal: React.FC<ProjectEditModalProps> = ({ isOpen, project, onClose, onConfirm }) => {
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [errors, setErrors] = useState<{ name?: string; path?: string }>({});

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setProjectPath(project.path || '');
      setErrors({});
    }
  }, [project]);

  const validateInputs = () => {
    const newErrors: { name?: string; path?: string } = {};
    
    if (!projectName.trim()) {
      newErrors.name = 'Project name is required';
    } else if (projectName.trim().length < 3) {
      newErrors.name = 'Project name must be at least 3 characters';
    }
    
    if (!projectPath.trim()) {
      newErrors.path = 'Project path is required';
    } else if (!projectPath.startsWith('/')) {
      newErrors.path = 'Path must be absolute (start with /)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = () => {
    if (!project) return;
    
    if (validateInputs()) {
      onConfirm(project.id, projectName.trim(), projectPath.trim());
      onClose();
    }
  };

  const handleCancel = () => {
    if (project) {
      setProjectName(project.name);
      setProjectPath(project.path || '');
    }
    setErrors({});
    onClose();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div className="project-edit-modal-overlay">
      <div className="project-edit-modal">
        <div className="project-edit-modal__header">
          <h2>Edit Project</h2>
          <button 
            className="project-edit-modal__close"
            onClick={handleCancel}
            title="Close"
          >
            ✕
          </button>
        </div>
        
        <div className="project-edit-modal__content">
          <div className="project-edit-modal__field">
            <label htmlFor="project-name">Project Name</label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter project name"
              className={errors.name ? 'error' : ''}
              autoFocus
            />
            {errors.name && <span className="project-edit-modal__error">{errors.name}</span>}
          </div>
          
          <div className="project-edit-modal__field">
            <label htmlFor="project-path">Project Path</label>
            <input
              id="project-path"
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="/path/to/your/project"
              className={errors.path ? 'error' : ''}
            />
            {errors.path && <span className="project-edit-modal__error">{errors.path}</span>}
          </div>
          
          <div className="project-edit-modal__info">
            <div className="project-edit-modal__info-icon">ℹ️</div>
            <div className="project-edit-modal__info-text">
              Changing the project path will update where Claude looks for files. 
              Make sure the new path exists and contains your project files.
            </div>
          </div>
        </div>
        
        <div className="project-edit-modal__actions">
          <button 
            className="project-edit-modal__button project-edit-modal__button--secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            className="project-edit-modal__button project-edit-modal__button--primary"
            onClick={handleConfirm}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditModal;