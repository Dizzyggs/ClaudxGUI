import React, { useState, useRef, useEffect } from 'react';
import Prism from 'prismjs';
import type { DiffData, DiffLine } from './types';
import './DiffDisplay.scss';

// Import language support in correct dependency order
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';

interface DiffDisplayProps {
  diff: DiffData;
  isCollapsed?: boolean;
}

const DiffDisplay: React.FC<DiffDisplayProps> = ({ diff, isCollapsed: initialCollapsed = true }) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [showFullDiff, setShowFullDiff] = useState(false);
  const codeRef = useRef<HTMLDivElement>(null);
  
  const maxLinesDefault = 3;
  const shouldTruncate = diff.lines.length > maxLinesDefault;
  const displayLines = showFullDiff ? diff.lines : diff.lines.slice(0, maxLinesDefault);

  // Get file extension for syntax highlighting
  const getLanguageFromPath = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'tsx',
      'js': 'javascript',
      'jsx': 'jsx',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'html': 'markup',
      'xml': 'markup'
    };
    return languageMap[ext || ''] || 'text';
  };

  // Apply syntax highlighting to content
  const highlightCode = (content: string, language: string): string => {
    try {
      const grammar = Prism.languages[language];
      if (grammar) {
        return Prism.highlight(content, grammar, language);
      }
    } catch (error) {
      console.warn('Failed to highlight code:', error);
    }
    return content;
  };

  // Generate diff summary
  const getDiffSummary = (): string => {
    if (diff.operation === 'create') {
      return `Created ${diff.filePath}`;
    } else if (diff.operation === 'delete') {
      return `Deleted ${diff.filePath}`;
    } else {
      return `Updated ${diff.filePath} with ${diff.additions} additions and ${diff.deletions} deletions`;
    }
  };

  // Get operation icon
  const getOperationIcon = (): string => {
    switch (diff.operation) {
      case 'create': return '➕';
      case 'update': return '📝';
      case 'delete': return '🗑️';
      default: return '📄';
    }
  };

  // Get operation color
  const getOperationColor = (): string => {
    switch (diff.operation) {
      case 'create': return '#22c55e';
      case 'update': return '#3b82f6';
      case 'delete': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="diff-display">
      <div 
        className="diff-display__header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer' }}
      >
        <div className="diff-display__file-info">
          <span className="diff-display__file-icon">📄</span>
          <span className="diff-display__filepath">{diff.filePath}</span>
        </div>
        
        <div className="diff-display__toggle">
          {isCollapsed ? '▶' : '▼'}
        </div>
      </div>

      {!isCollapsed && (
        <div className="diff-display__content" ref={codeRef}>
          <div className="diff-display__lines">
            {displayLines.map((line, index) => (
              <div
                key={index}
                className={`diff-display__line diff-display__line--${line.type}`}
              >
                <div 
                  className="diff-display__line-content"
                  dangerouslySetInnerHTML={{
                    __html: (line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ') + 
                           highlightCode(line.content, getLanguageFromPath(diff.filePath))
                  }}
                />
              </div>
            ))}
          </div>
          
          {shouldTruncate && (
            <div className="diff-display__expand">
              <button 
                className="diff-display__expand-button"
                onClick={() => setShowFullDiff(!showFullDiff)}
              >
                {showFullDiff ? (
                  <>▲ Show less</>
                ) : (
                  <>▼ Show entire diff ({diff.lines.length - maxLinesDefault} more lines)</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiffDisplay;