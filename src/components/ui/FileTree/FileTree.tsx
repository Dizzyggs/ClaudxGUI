import React, { useState, useEffect } from 'react';
import { getFileIcon } from '../../../utils/fileIcons';
import './FileTree.scss';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  isExpanded?: boolean;
}

interface FileTreeProps {
  projectPath: string;
  onFileSelect: (filePath: string) => void;
  selectedFile?: string;
  refreshTrigger?: number;
}

const FileTree: React.FC<FileTreeProps> = ({ projectPath, onFileSelect, selectedFile, refreshTrigger }) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFiles, setNewFiles] = useState<Set<string>>(new Set());
  const [previousFileTree, setPreviousFileTree] = useState<FileNode[]>([]);

  useEffect(() => {
    if (projectPath) {
      fetchFileTree();
    }
  }, [projectPath, refreshTrigger]);

  // Helper function to get all file paths from a tree
  const getAllFilePaths = (nodes: FileNode[]): Set<string> => {
    const paths = new Set<string>();
    const traverse = (nodeList: FileNode[]) => {
      nodeList.forEach(node => {
        if (node.type === 'file') {
          paths.add(node.path);
        }
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(nodes);
    return paths;
  };

  const fetchFileTree = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3001/api/files/tree?path=${encodeURIComponent(projectPath)}`);
      const data = await response.json();
      
      // Check if the response is an error
      if (data.error) {
        console.error('File tree API error:', data.error);
        setFileTree([]);
        return;
      }
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        // Compare with previous file tree to detect new files
        if (previousFileTree.length > 0) {
          const oldPaths = getAllFilePaths(previousFileTree);
          const newPaths = getAllFilePaths(data);
          const addedFiles = new Set<string>();
          
          newPaths.forEach(path => {
            if (!oldPaths.has(path)) {
              addedFiles.add(path);
            }
          });
          
          if (addedFiles.size > 0) {
            setNewFiles(addedFiles);
            // Clear the flash after 2 seconds
            setTimeout(() => {
              setNewFiles(new Set());
            }, 2000);
          }
        }
        
        setPreviousFileTree(fileTree);
        setFileTree(data);
      } else {
        console.error('Invalid file tree data format:', data);
        setFileTree([]);
      }
    } catch (error) {
      console.error('Failed to fetch file tree:', error);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (path: string) => {
    const updateNode = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === path) {
          return { ...node, isExpanded: !node.isExpanded };
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setFileTree(updateNode(fileTree));
  };

  const getNodeIcon = (node: FileNode) => {
    if (node.type === 'directory') {
      return node.isExpanded ? '📁' : '📂';
    }
    return getFileIcon(node.name);
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    const isSelected = selectedFile === node.path;
    const isNewFile = node.type === 'file' && newFiles.has(node.path);
    
    return (
      <div key={node.path} className="file-tree__node">
        <div 
          className={`file-tree__item ${isSelected ? 'file-tree__item--selected' : ''} ${isNewFile ? 'file-tree__item--new' : ''}`}
          style={{ paddingLeft: `${depth * 1.5}rem` }}
          onClick={() => {
            if (node.type === 'directory') {
              toggleExpanded(node.path);
            } else {
              onFileSelect(node.path);
            }
          }}
        >
          <span className="file-tree__icon">{getNodeIcon(node)}</span>
          <span className="file-tree__name">{node.name}</span>
          {node.type === 'directory' && (
            <span className="file-tree__toggle">
              {node.isExpanded ? '▼' : '▶'}
            </span>
          )}
        </div>
        
        {node.type === 'directory' && node.isExpanded && node.children && (
          <div className="file-tree__children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="file-tree">
        <div className="file-tree__header">
          <span>Files</span>
          <button 
            className="file-tree__refresh"
            onClick={fetchFileTree}
            title="Refresh"
          >
            🔄
          </button>
        </div>
        <div className="file-tree__loading">Loading files...</div>
      </div>
    );
  }

  return (
    <div className="file-tree">
      <div className="file-tree__header">
        <span>Files</span>
        <button 
          className="file-tree__refresh"
          onClick={fetchFileTree}
          title="Refresh"
        >
          🔄
        </button>
      </div>
      <div className="file-tree__content">
        {Array.isArray(fileTree) && fileTree.length > 0 ? (
          fileTree.map(node => renderNode(node))
        ) : (
          <div className="file-tree__empty">No files found</div>
        )}
      </div>
    </div>
  );
};

export default FileTree;