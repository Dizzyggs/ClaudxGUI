import React, { useState } from 'react';
import './Sidebar.scss';
import FileTree from '../../ui/FileTree/FileTree';
import ContextMenu from '../../ui/ContextMenu/ContextMenu';

interface Project {
  id: string;
  name: string;
  path?: string;
}

interface SidebarProps {
  projects: Project[];
  loading: boolean;
  selectedProject: Project | null;
  onProjectSelect: (project: Project) => void;
  onNewProject: () => void;
  onOpenRecent: () => void;
  onDeleteProject: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onFileSelect?: (filePath: string) => void;
  selectedFile?: string;
  fileTreeRefresh?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ projects, loading, selectedProject, onProjectSelect, onNewProject, onOpenRecent, onDeleteProject, onEditProject, onFileSelect, selectedFile, fileTreeRefresh }) => {
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; position: { x: number; y: number }; project: Project | null }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    project: null
  });

  const handleContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      project
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, project: null });
  };

  const handleEditProject = (project: Project) => {
    if (onEditProject) {
      onEditProject(project);
    }
    handleCloseContextMenu();
  };

  const handleDeleteFromContext = (project: Project) => {
    onDeleteProject(project);
    handleCloseContextMenu();
  };

  const contextMenuItems = contextMenu.project ? [
    {
      label: 'Edit Project',
      icon: '✏️',
      onClick: () => handleEditProject(contextMenu.project!)
    },
    {
      label: 'Delete Project',
      icon: '🗑️',
      onClick: () => handleDeleteFromContext(contextMenu.project!),
      dangerous: true
    }
  ] : [];

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__logo">
          <div className="sidebar__logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="sidebar__logo-text">Claude<span style={{color: '#FF0000', fontWeight: '800'}}>x</span>GUI</span>
        </div>
        
        <div className="sidebar__actions">
          <button className="sidebar__action-btn" onClick={onNewProject} title="New Project">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            New
          </button>
          <button className="sidebar__action-btn" onClick={onOpenRecent} title="Open Recent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8V12L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Recent
          </button>
        </div>
      </div>
      
      <nav className="sidebar__nav">
        <div className="sidebar__section">
          <div className="sidebar__nav-title">Recent Projects</div>
          {loading ? (
            <div className="sidebar__loading">
              <div className="sidebar__loading-spinner"></div>
              Loading...
            </div>
          ) : projects.length === 0 ? (
            <div className="sidebar__empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 2H5C3.89543 2 3 2.89543 3 4V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12V8C21 6.89543 20.1046 6 19 6H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 16V20C3 21.1046 3.89543 22 5 22H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 22H19C20.1046 22 21 21.1046 21 20V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>No recent projects</p>
              <button className="sidebar__empty-action" onClick={onNewProject}>
                Create your first project
              </button>
            </div>
          ) : (
            <ul className="sidebar__project-list">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className={`sidebar__project-item ${selectedProject?.id === project.id ? 'sidebar__project-item--active' : ''}`}
                  onClick={() => onProjectSelect(project)}
                  onContextMenu={(e) => handleContextMenu(e, project)}
                >
                  <div className="sidebar__project-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 2H5C3.89543 2 3 2.89543 3 4V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M21 12V8C21 6.89543 20.1046 6 19 6H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 16V20C3 21.1046 3.89543 22 5 22H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M15 22H19C20.1046 22 21 21.1046 21 20V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="sidebar__project-info">
                    <span className="sidebar__project-name">{project.name}</span>
                    <span className="sidebar__project-path">{project.path || '/path/to/project'}</span>
                  </div>
                  <div className="sidebar__project-actions">
                    <button 
                      className="sidebar__project-action sidebar__project-action--delete" 
                      title="Delete project (removes all tracked changes)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 6H5H21" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V6H19Z" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 11V17" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M14 11V17" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
      
      {/* File Tree - Only show when a project is selected */}
      {selectedProject && selectedProject.path && onFileSelect && (
        <FileTree
          projectPath={selectedProject.path}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          refreshTrigger={fileTreeRefresh}
        />
      )}
      
      <div className="sidebar__footer">
        <div className="sidebar__footer-info">
          <span>ClaudexGUI</span>
          <span>v1.0.0</span>
        </div>
      </div>
      
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        items={contextMenuItems}
        onClose={handleCloseContextMenu}
      />
    </aside>
  );
};

export default Sidebar;