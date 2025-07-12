import React from 'react';
import './TechBadge.scss';

interface TechBadgeProps {
  name: string;
  type?: 'framework' | 'library' | 'tool' | 'language' | 'style';
  size?: 'small' | 'medium' | 'large';
}

const TechBadge: React.FC<TechBadgeProps> = ({ 
  name, 
  type = 'library',
  size = 'medium' 
}) => {
  const getIcon = (techName: string, techType: string) => {
    const lowerName = techName.toLowerCase();
    
    // Specific technology icons
    if (lowerName.includes('react')) return '⚛️';
    if (lowerName.includes('tailwind')) return '🎨';
    if (lowerName.includes('chakra')) return '🔮';
    if (lowerName.includes('css')) return '🎨';
    if (lowerName.includes('sass') || lowerName.includes('scss')) return '💅';
    if (lowerName.includes('typescript') || lowerName.includes('ts')) return '🔷';
    if (lowerName.includes('javascript') || lowerName.includes('js')) return '🟨';
    if (lowerName.includes('firebase')) return '🔥';
    if (lowerName.includes('router')) return '🛣️';
    if (lowerName.includes('motion') || lowerName.includes('animation')) return '🎭';
    if (lowerName.includes('editor')) return '📝';
    if (lowerName.includes('emotion')) return '💫';
    if (lowerName.includes('framer')) return '🎬';
    
    // Fallback by type
    switch (techType) {
      case 'framework': return '🏗️';
      case 'library': return '📚';
      case 'tool': return '🔧';
      case 'language': return '💻';
      case 'style': return '🎨';
      default: return '📦';
    }
  };

  return (
    <span className={`tech-badge tech-badge--${type} tech-badge--${size}`}>
      <span className="tech-badge__icon">
        {getIcon(name, type)}
      </span>
      <span className="tech-badge__name">{name}</span>
    </span>
  );
};

export default TechBadge;