import React, { useState, useEffect, useRef } from 'react';
import './FileEditor.scss';
import Prism from 'prismjs';
import 'prismjs/themes/prism-dark.css';

// Import languages in proper dependency order
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-lua';

// Try to load additional languages
try {
  import('prismjs/components/prism-markup-templating');
  import('prismjs/components/prism-php');
} catch (e) {
  console.warn('Failed to load PHP syntax highlighting:', e);
}

try {
  import('prismjs/components/prism-rust');
  import('prismjs/components/prism-go');
  import('prismjs/components/prism-sql');
} catch (e) {
  console.warn('Failed to load additional language support:', e);
}

interface FileEditorProps {
  filePath: string;
  onClose: () => void;
  onSave: (content: string) => void;
}

const FileEditor: React.FC<FileEditorProps> = ({ filePath, onClose, onSave }) => {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLElement>(null);
  const highlightContainerRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fetchFileContent();
  }, [filePath]);

  const fetchFileContent = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`http://localhost:3001/api/files/content?path=${encodeURIComponent(filePath)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load file: ${response.statusText}`);
      }
      
      const data = await response.json();
      setContent(data.content);
      setOriginalContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/files/content', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: filePath,
          content: content,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save file: ${response.statusText}`);
      }
      
      setOriginalContent(content);
      onSave(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = content !== originalContent;

  const getFileLanguage = (filePath: string): string => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'py':
        return 'python';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'scss':
        return 'scss';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'sh':
      case 'bash':
        return 'bash';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'c':
        return 'c';
      case 'cpp':
      case 'cxx':
        return 'cpp';
      case 'java':
        return 'java';
      case 'php':
        return 'php';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'sql':
        return 'sql';
      case 'lua':
        return 'lua';
      default:
        return 'text';
    }
  };

  // Update syntax highlighting
  useEffect(() => {
    if (highlightRef.current && content) {
      try {
        highlightRef.current.textContent = content;
        Prism.highlightElement(highlightRef.current);
      } catch (error) {
        console.warn('Failed to highlight code:', error);
      }
    }
  }, [content, filePath]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newValue);
      // Set cursor position after the tab
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightContainerRef.current) {
      const textarea = e.currentTarget;
      highlightContainerRef.current.scrollTop = textarea.scrollTop;
      highlightContainerRef.current.scrollLeft = textarea.scrollLeft;
    }
  };

  const getFileName = (filePath: string): string => {
    return filePath.split('/').pop() || filePath;
  };

  if (loading) {
    return (
      <div className="file-editor">
        <div className="file-editor__header">
          <div className="file-editor__title">
            <span className="file-editor__file-name">{getFileName(filePath)}</span>
          </div>
          <button className="file-editor__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="file-editor__content">
          <div className="file-editor__loading">Loading file...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-editor">
        <div className="file-editor__header">
          <div className="file-editor__title">
            <span className="file-editor__file-name">{getFileName(filePath)}</span>
          </div>
          <button className="file-editor__close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="file-editor__content">
          <div className="file-editor__error">
            <span>Error: {error}</span>
            <button onClick={fetchFileContent}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="file-editor">
      <div className="file-editor__header">
        <div className="file-editor__title">
          <span className="file-editor__file-name">
            {getFileName(filePath)}
            {hasUnsavedChanges && <span className="file-editor__unsaved">•</span>}
          </span>
          <span className="file-editor__file-path">{filePath}</span>
        </div>
        <div className="file-editor__actions">
          <button 
            className="file-editor__save" 
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="file-editor__close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>
      
      <div className="file-editor__content">
        <div className="file-editor__editor">
          <textarea
            ref={textareaRef}
            className="file-editor__textarea"
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder="Start typing..."
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            data-gramm="false"
          />
          <pre 
            ref={highlightContainerRef}
            className="file-editor__highlight" 
            aria-hidden="true"
          >
            <code
              ref={highlightRef}
              className={`language-${getFileLanguage(filePath)}`}
            >
              {content}
            </code>
          </pre>
        </div>
      </div>
      
      <div className="file-editor__footer">
        <div className="file-editor__info">
          <span>Language: {getFileLanguage(filePath)}</span>
          <span>Lines: {content.split('\n').length}</span>
          <span>Characters: {content.length}</span>
        </div>
        {hasUnsavedChanges && (
          <div className="file-editor__warning">
            Unsaved changes
          </div>
        )}
      </div>
    </div>
  );
};

export default FileEditor;