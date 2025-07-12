import React, { useState } from 'react';
import './PermissionStatus.scss';

interface PermissionStatusProps {
  sessionPermissions: {[key: string]: any};
  onClearPermissions?: () => void;
}

const PermissionStatus: React.FC<PermissionStatusProps> = ({ 
  sessionPermissions, 
  onClearPermissions 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract actual permissions (filter out helper fields)
  const permissions = Object.entries(sessionPermissions).filter(([key]) => 
    !key.includes('_label') && !key.includes('_granted_at')
  );

  const getPermissionIcon = (type: string) => {
    switch (type) {
      case 'file_write': return '✏️';
      case 'file_edit': return '🔧';
      case 'file_delete': return '🗑️';
      case 'bash_command': return '⚡';
      case 'network': return '🌐';
      case 'system': return '⚙️';
      default: return '🔐';
    }
  };

  const getPermissionScope = (scope: string) => {
    return scope === 'session' ? 'This Session' : 'Once';
  };

  const formatTimeAgo = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (permissions.length === 0) {
    return null;
  }

  return (
    <div className="permission-status">
      <div 
        className="permission-status__header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="permission-status__info">
          <span className="permission-status__icon">🔐</span>
          <span className="permission-status__title">
            Claude has {permissions.length} permission{permissions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="permission-status__actions">
          {onClearPermissions && (
            <button 
              className="permission-status__clear"
              onClick={(e) => {
                e.stopPropagation();
                onClearPermissions();
              }}
              title="Clear all permissions"
            >
              Clear
            </button>
          )}
          <span className={`permission-status__toggle ${isExpanded ? 'permission-status__toggle--expanded' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {isExpanded && (
        <div className="permission-status__content">
          <div className="permission-status__list">
            {permissions.map(([type, scope]) => {
              const label = sessionPermissions[`${type}_label`] || type;
              const grantedAt = sessionPermissions[`${type}_granted_at`];
              
              return (
                <div key={type} className="permission-status__item">
                  <div className="permission-status__item-main">
                    <span className="permission-status__item-icon">
                      {getPermissionIcon(type)}
                    </span>
                    <span className="permission-status__item-label">{label}</span>
                    <span className={`permission-status__item-scope permission-status__item-scope--${scope}`}>
                      {getPermissionScope(scope)}
                    </span>
                  </div>
                  {grantedAt && (
                    <div className="permission-status__item-time">
                      Granted {formatTimeAgo(grantedAt)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default PermissionStatus;