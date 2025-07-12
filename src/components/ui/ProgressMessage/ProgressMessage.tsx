import React from 'react';
import './ProgressMessage.scss';

interface ProgressMessageProps {
  type: 'reading' | 'editing' | 'deleting' | 'adding';
  fileName: string;
  isCompleted?: boolean;
}

const ProgressMessage: React.FC<ProgressMessageProps> = ({ type, fileName, isCompleted = false }) => {
  const getIcon = () => {
    switch (type) {
      case 'reading': return '🔍';
      case 'editing': return '✏️';
      case 'deleting': return '🗑️';
      case 'adding': return '➕';
      default: return '🔧';
    }
  };

  const getActionText = () => {
    switch (type) {
      case 'reading': return 'Reading';
      case 'editing': return 'Editing';
      case 'deleting': return 'Deleting';
      case 'adding': return 'Adding';
      default: return 'Processing';
    }
  };

  return (
    <div className={`progress-message progress-message--${type} ${isCompleted ? 'progress-message--completed' : ''}`}>
      <div className="progress-message__content">
        <div className="progress-message__icon-wrapper">
          {!isCompleted && <div className="progress-message__spinner"></div>}
          <span className="progress-message__icon">{getIcon()}</span>
        </div>
        <div className="progress-message__text">
          <span className="progress-message__action">{getActionText()}:</span>
          <span className="progress-message__filename">{fileName}</span>
        </div>
        {isCompleted && (
          <div className="progress-message__check">
            <span className="progress-message__check-icon">✅</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressMessage;