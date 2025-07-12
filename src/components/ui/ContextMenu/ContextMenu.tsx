import React, { useEffect, useRef } from 'react';
import './ContextMenu.scss';

interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  dangerous?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, position, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.addEventListener('contextmenu', onClose);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('contextmenu', onClose);
    };
  }, [isOpen, onClose]);

  const handleItemClick = (item: ContextMenuItem) => {
    item.onClick();
    onClose();
  };

  if (!isOpen) return null;

  // Adjust position to keep menu within viewport
  const adjustedPosition = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (position.x + rect.width > viewportWidth) {
      adjustedPosition.x = viewportWidth - rect.width - 10;
    }

    if (position.y + rect.height > viewportHeight) {
      adjustedPosition.y = viewportHeight - rect.height - 10;
    }
  }

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          className={`context-menu__item ${item.dangerous ? 'context-menu__item--dangerous' : ''}`}
          onClick={() => handleItemClick(item)}
        >
          {item.icon && <span className="context-menu__icon">{item.icon}</span>}
          <span className="context-menu__label">{item.label}</span>
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;