import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './MessageInput.scss';
import { getFileIcon } from '../../../utils/fileIcons';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (images?: File[], mentionedFiles?: string[]) => void;
  canSend: boolean;
  canAbort?: boolean;
  onAbort?: () => void;
  uploadingImages?: boolean;
  projectPath?: string;
  fileListRefresh?: number;
}

const MessageInput: React.FC<MessageInputProps> = ({ value, onChange, onSend, canSend, canAbort = false, onAbort, uploadingImages = false, projectPath, fileListRefresh }) => {
  const [pastedImages, setPastedImages] = useState<File[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteFiles, setAutocompleteFiles] = useState<string[]>([]);
  const [currentMentionStart, setCurrentMentionStart] = useState<number>(-1);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available files when project path changes or when file list refresh is triggered
  useEffect(() => {
    if (projectPath) {
      fetchAvailableFiles();
    }
  }, [projectPath, fileListRefresh]);

  const fetchAvailableFiles = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/projects/files?path=${encodeURIComponent(projectPath || '')}`);
      const data = await response.json();
      if (data.files) {
        setAvailableFiles(data.files);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        setSelectedFileIndex(0);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedFileIndex(prev => 
          prev > 0 ? prev - 1 : autocompleteFiles.length - 1
        );
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedFileIndex(prev => 
          prev < autocompleteFiles.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (autocompleteFiles.length > 0 && selectedFileIndex >= 0 && selectedFileIndex < autocompleteFiles.length) {
          e.preventDefault();
          selectFile(autocompleteFiles[selectedFileIndex]);
          return;
        }
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey && canSend && !canAbort && !showAutocomplete) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const extractMentionedFiles = (text: string): string[] => {
    const mentions = text.match(/@([^\s]+)/g) || [];
    return mentions.map(mention => mention.slice(1)); // Remove @ prefix
  };

  const selectFile = (filename: string) => {
    if (currentMentionStart >= 0) {
      const beforeMention = value.slice(0, currentMentionStart);
      const afterCursor = value.slice(inputRef.current?.selectionStart || value.length);
      const newValue = `${beforeMention}@${filename} ${afterCursor}`;
      onChange(newValue);
      setShowAutocomplete(false);
      setCurrentMentionStart(-1);
      
      // Reset cursor position after file selection
      setTimeout(() => {
        if (inputRef.current) {
          const newCursorPos = beforeMention.length + filename.length + 2;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  // Optimized autocomplete with useMemo to prevent recalculation on every render
  const autocompleteResults = useMemo(() => {
    if (!showAutocomplete || currentMentionStart < 0) return [];
    
    const beforeCursor = value.slice(0, inputRef.current?.selectionStart || value.length);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    if (atIndex >= 0) {
      const afterAt = beforeCursor.slice(atIndex + 1);
      const hasSpace = afterAt.includes(' ');
      
      if (!hasSpace) {
        const searchTerm = afterAt.toLowerCase();
        return availableFiles
          .filter(file => file.toLowerCase().includes(searchTerm))
          .slice(0, 5);
      }
    }
    return [];
  }, [value, availableFiles, showAutocomplete, currentMentionStart]);

  // Debounced input change handler
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    onChange(newValue);
    
    // Quick check for @ mentions without heavy processing
    const beforeCursor = newValue.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf('@');
    
    if (atIndex >= 0) {
      const afterAt = beforeCursor.slice(atIndex + 1);
      const hasSpace = afterAt.includes(' ');
      
      if (!hasSpace && afterAt.length >= 0) {
        setShowAutocomplete(true);
        setCurrentMentionStart(atIndex);
        setSelectedFileIndex(0);
      } else {
        setShowAutocomplete(false);
        setCurrentMentionStart(-1);
        setSelectedFileIndex(0);
      }
    } else {
      setShowAutocomplete(false);
      setCurrentMentionStart(-1);
      setSelectedFileIndex(0);
    }
  }, [onChange]);

  // Update autocomplete files when results change
  useEffect(() => {
    setAutocompleteFiles(autocompleteResults);
  }, [autocompleteResults]);

  const handleSend = () => {
    const mentionedFiles = extractMentionedFiles(value);
    onSend(
      pastedImages.length > 0 ? pastedImages : undefined,
      mentionedFiles.length > 0 ? mentionedFiles : undefined
    );
    setPastedImages([]);
    setShowAutocomplete(false);
  };
  
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }
    
    if (imageFiles.length > 0) {
      setPastedImages(prev => [...prev, ...imageFiles]);
      e.preventDefault();
    }
  };
  
  const removeImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  };

  const renderHighlightedText = (text: string) => {
    const parts = [];
    let currentIndex = 0;
    
    // Match @filename patterns
    const filePattern = /@([^\s]*\.(tsx|jsx|typescript|javascript|json|html|scss|css|yaml|yml|jpeg|tiff|tsx?|jsx?|js|html?|md|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|sql|xml|toml|ini|conf|txt|png|jpe?g|gif|svg|ico|webp|bmp|tiff?))/g;
    let match;
    
    while ((match = filePattern.exec(text)) !== null) {
      // Add text before the file reference
      if (match.index > currentIndex) {
        parts.push(
          <span key={`text-${currentIndex}`} className="message-input__regular-text">
            {text.substring(currentIndex, match.index)}
          </span>
        );
      }
      
      // Add styled file reference
      const filename = match[1];
      parts.push(
        <span key={`file-${match.index}`} className="message-input__file-reference">
          <span className="message-input__file-reference-icon">{getFileIcon(filename)}</span>
          <span className="message-input__file-reference-name">{filename}</span>
        </span>
      );
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(
        <span key={`text-${currentIndex}`} className="message-input__regular-text">
          {text.substring(currentIndex)}
        </span>
      );
    }
    
    return parts.length > 0 ? parts : <span className="message-input__regular-text">{text}</span>;
  };

  return (
    <div className="message-input">
      {pastedImages.length > 0 && (
        <div className="message-input__images">
          {pastedImages.map((file, index) => (
            <div key={index} className="message-input__image-preview">
              <img 
                src={URL.createObjectURL(file)} 
                alt={`Pasted image ${index + 1}`}
                className="message-input__image"
              />
              <button 
                className="message-input__remove-image"
                onClick={() => removeImage(index)}
                title="Remove image"
              >
                ✕
              </button>
              <div className="message-input__image-name">{file.name || 'Pasted image'}</div>
            </div>
          ))}
        </div>
      )}
      <div className="message-input__row">
        <div className="message-input__input-container">
          <textarea
            ref={inputRef}
            className="message-input__field"
            placeholder={pastedImages.length > 0 ? "Add a message about the image... (use @filename to reference files)" : "Type your message... (use @filename to reference files)"}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={false}
            rows={3}
          />
          {(canAbort && onAbort) ? (
            <button
              className="message-input__abort"
              onClick={onAbort}
              title="Abort current operation"
            >
              Abort
            </button>
          ) : (
            <button
              className="message-input__send"
              onClick={handleSend}
              disabled={(!value.trim() && pastedImages.length === 0) || !canSend || uploadingImages}
              title={uploadingImages ? 'Uploading...' : 'Send message'}
            >
              ↑
            </button>
          )}
          {showAutocomplete && (
            <div className="message-input__autocomplete">
              {autocompleteFiles.map((file, index) => (
                <div
                  key={index}
                  className={`message-input__autocomplete-item ${index === selectedFileIndex ? 'message-input__autocomplete-item--selected' : ''}`}
                  onClick={() => selectFile(file)}
                >
                  <span className="message-input__file-icon">{getFileIcon(file)}</span>
                  <span className="message-input__file-name">{file}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageInput;