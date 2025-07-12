import React, { useState } from 'react';
import './OperationSummary.scss';

interface Operation {
  id: string;
  type: 'read' | 'write' | 'edit' | 'delete' | 'bash' | 'search';
  file: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
  details?: string;
}

interface OperationSummaryProps {
  operations: Operation[];
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const OperationSummary: React.FC<OperationSummaryProps> = ({ 
  operations, 
  title, 
  isExpanded = false, 
  onToggle 
}) => {
  const [expanded, setExpanded] = useState(isExpanded);

  const handleToggle = () => {
    setExpanded(!expanded);
    onToggle?.();
  };

  const getStatusIcon = (status: Operation['status']) => {
    switch (status) {
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'in_progress': return '⏳';
      case 'pending': return '⏸️';
      default: return '❓';
    }
  };

  const getTypeIcon = (type: Operation['type']) => {
    switch (type) {
      case 'read': return '📖';
      case 'write': return '✏️';
      case 'edit': return '📝';
      case 'delete': return '🗑️';
      case 'bash': return '💻';
      case 'search': return '🔍';
      default: return '🔧';
    }
  };

  const getTypeColor = (type: Operation['type']) => {
    switch (type) {
      case 'read': return '#3b82f6';
      case 'write': return '#10b981';
      case 'edit': return '#f59e0b';
      case 'delete': return '#ef4444';
      case 'bash': return '#8b5cf6';
      case 'search': return '#06b6d4';
      default: return '#6b7280';
    }
  };

  const completedCount = operations.filter(op => op.status === 'completed').length;
  const totalCount = operations.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="operation-summary">
      <div className="operation-summary__header" onClick={handleToggle}>
        <div className="operation-summary__title-section">
          <div className="operation-summary__icon">
            <span className={`operation-summary__chevron ${expanded ? 'expanded' : ''}`}>
              ▼
            </span>
          </div>
          <h3 className="operation-summary__title">{title}</h3>
          <div className="operation-summary__badge">
            {completedCount}/{totalCount}
          </div>
        </div>
        <div className="operation-summary__progress-container">
          <div 
            className="operation-summary__progress-bar"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {expanded && (
        <div className="operation-summary__content">
          <div className="operation-summary__operations">
            {operations.map((operation) => (
              <div 
                key={operation.id} 
                className={`operation-summary__operation operation-summary__operation--${operation.status}`}
              >
                <div className="operation-summary__operation-icon">
                  <span 
                    className="operation-summary__type-icon"
                    style={{ color: getTypeColor(operation.type) }}
                  >
                    {getTypeIcon(operation.type)}
                  </span>
                  {operation.status === 'in_progress' && (
                    <div className="operation-summary__spinner" />
                  )}
                </div>
                <div className="operation-summary__operation-details">
                  <div className="operation-summary__operation-main">
                    <span className="operation-summary__operation-type">
                      {operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}
                    </span>
                    <span className="operation-summary__operation-file">
                      {operation.file}
                    </span>
                  </div>
                  {operation.details && (
                    <div className="operation-summary__operation-meta">
                      {operation.details}
                    </div>
                  )}
                </div>
                <div className="operation-summary__operation-status">
                  <span className="operation-summary__status-icon">
                    {getStatusIcon(operation.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationSummary;