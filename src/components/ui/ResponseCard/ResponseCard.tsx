import React, { useState } from 'react';
import './ResponseCard.scss';

interface ResponseCardProps {
  title: string;
  icon?: string;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'teal';
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  badge?: string;
}

const ResponseCard: React.FC<ResponseCardProps> = ({
  title,
  icon = '📄',
  color = 'blue',
  children,
  collapsible = false,
  defaultExpanded = true,
  badge
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className={`response-card response-card--${color}`}>
      <div 
        className={`response-card__header ${collapsible ? 'response-card__header--clickable' : ''}`}
        onClick={handleToggle}
      >
        <div className="response-card__title-section">
          <span className="response-card__icon">{icon}</span>
          <h3 className="response-card__title">{title}</h3>
          {badge && <span className="response-card__badge">{badge}</span>}
        </div>
        {collapsible && (
          <span className={`response-card__toggle ${isExpanded ? 'response-card__toggle--expanded' : ''}`}>
            ▼
          </span>
        )}
      </div>
      
      {isExpanded && (
        <div className="response-card__content">
          {children}
        </div>
      )}
    </div>
  );
};

export default ResponseCard;