import React from 'react';
import './PermissionRequest.scss';

export interface PermissionRequestData {
  id: string;
  type: 'file_write' | 'file_edit' | 'file_delete' | 'bash_command' | 'network' | 'system';
  action: string;
  command?: string;
  reason?: string;
  filePath?: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export type PermissionResponse = 'allow_once' | 'allow_session' | 'deny_suggest_alt';

interface PermissionRequestProps {
  request: PermissionRequestData;
  onResponse: (response: PermissionResponse) => void;
}

const PermissionRequest: React.FC<PermissionRequestProps> = ({ request, onResponse }) => {
  const getIcon = () => {
    switch (request.type) {
      case 'file_write':
      case 'file_edit':
        return '📝';
      case 'file_delete':
        return '🗑️';
      case 'bash_command':
        return '⚡';
      case 'network':
        return '🌐';
      case 'system':
        return '⚙️';
      default:
        return '🔧';
    }
  };

  const getRiskColor = () => {
    switch (request.riskLevel) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const getActionDescription = () => {
    switch (request.type) {
      case 'bash_command':
        return 'Claude wants to run a terminal command:';
      case 'file_write':
        return 'Claude wants to create a file:';
      case 'file_edit':
        return 'Claude wants to edit a file:';
      case 'file_delete':
        return 'Claude wants to delete a file:';
      case 'network':
        return 'Claude wants to make a network request:';
      case 'system':
        return 'Claude wants to run a system command:';
      default:
        return 'Claude wants to perform an action:';
    }
  };

  return (
    <div className="permission-request">
      <div className="permission-request__header">
        <span className="permission-request__icon">{getIcon()}</span>
        <span 
          className="permission-request__title"
          style={{ color: getRiskColor() }}
        >
          Claude needs permission
        </span>
      </div>

      <div className="permission-request__content">
        <p className="permission-request__description">
          {getActionDescription()}
        </p>
        
        {request.command && (
          <div className="permission-request__command">
            <code>$ {request.command}</code>
          </div>
        )}
        
        {request.filePath && (
          <div className="permission-request__file">
            <code>{request.filePath}</code>
          </div>
        )}

        {request.reason && (
          <p className="permission-request__reason">
            {request.reason}
          </p>
        )}
      </div>

      <div className="permission-request__actions">
        <button 
          className="permission-request__button permission-request__button--primary"
          onClick={() => onResponse('allow_once')}
        >
          Yes
        </button>
        <button 
          className="permission-request__button permission-request__button--session"
          onClick={() => onResponse('allow_session')}
        >
          Yes, don't ask again this session
        </button>
        <button 
          className="permission-request__button permission-request__button--deny"
          onClick={() => onResponse('deny_suggest_alt')}
        >
          No, do something differently
        </button>
      </div>
    </div>
  );
};

export default PermissionRequest;
export type { PermissionRequestData, PermissionResponse };