import React, { useEffect, useRef, useState } from 'react';
import './MessageList.scss';
import Prism from 'prismjs';
import 'prismjs/themes/prism-dark.css';
import claudeLogo from '../../../assets/claude-logo.png';
import DiffDisplay from '../../ui/DiffDisplay/DiffDisplay';
import PermissionRequest from '../../ui/PermissionRequest/PermissionRequest';
import PermissionAlert from '../../ui/PermissionAlert/PermissionAlert';
import { getFileIcon } from '../../../utils/fileIcons';
import type { DiffData } from '../../ui/DiffDisplay/types';
import type { PermissionResponse, PermissionRequestData } from '../../ui/PermissionRequest/PermissionRequest';

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

// Only load PHP and other complex languages if needed
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

// Simple code block detection and highlighting
const formatMessage = (text: string) => {
  // Split message into parts (text and code blocks)
  const parts = [];
  let currentIndex = 0;
  
  // Match code blocks (triple backticks)
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > currentIndex) {
      parts.push({
        type: 'text',
        content: text.substring(currentIndex, match.index)
      });
    }
    
    // Add code block
    parts.push({
      type: 'code',
      language: match[1] || 'text',
      content: match[2].trim()
    });
    
    currentIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (currentIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(currentIndex)
    });
  }
  
  // If no code blocks found, return text as single part
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text });
  }
  
  return parts;
};

const CodeBlock: React.FC<{ language: string; content: string }> = ({ language, content }) => {
  const codeRef = useRef<HTMLElement>(null);
  
  useEffect(() => {
    if (codeRef.current) {
      try {
        Prism.highlightElement(codeRef.current);
      } catch (error) {
        console.warn('Failed to highlight code block:', error);
        // Fallback: just display the code without highlighting
        if (codeRef.current) {
          codeRef.current.textContent = content;
        }
      }
    }
  }, [content]);
  
  // Map common language aliases to Prism language names
  const getLanguageClass = (lang: string) => {
    const langMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'sh': 'bash',
      'shell': 'bash',
      'yml': 'yaml',
      'md': 'markdown'
    };
    return langMap[lang.toLowerCase()] || lang.toLowerCase();
  };
  
  const prismLanguage = getLanguageClass(language);
  
  return (
    <div className="message-code-block">
      <div className="message-code-header">
        <span className="message-code-language">{language}</span>
      </div>
      <pre className="message-code-content">
        <code ref={codeRef} className={`language-${prismLanguage}`}>
          {content}
        </code>
      </pre>
    </div>
  );
};

const renderFormattedMessage = (text: string) => {
  const parts = formatMessage(text);
  
  return parts.map((part, index) => {
    if (part.type === 'code') {
      return (
        <CodeBlock key={index} language={part.language} content={part.content} />
      );
    } else {
      // Handle inline code, bold, and italic formatting
      const formatLineContent = (line: string, lineIndex: number) => {
        // Check if line is a header
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headerMatch) {
          const [, hashes, headerText] = headerMatch;
          const level = hashes.length;
          const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
          
          return (
            <HeaderTag key={`header-${lineIndex}`} className={`message-header message-header--${level}`}>
              {formatInlineElements(headerText)}
            </HeaderTag>
          );
        }
        
        // Not a header, process as regular text with inline formatting
        return formatInlineElements(line);
      };

      const formatInlineElements = (text: string) => {
        const elements: React.ReactNode[] = [];
        let currentIndex = 0;
        
        // More precise regex patterns - match referenced files first, then code, bold, italic
        const patterns = [
          { regex: /@([^\s]*\.(tsx|jsx|typescript|javascript|json|html|scss|css|yaml|yml|jpeg|tiff|tsx?|jsx?|js|html?|md|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|sql|xml|toml|ini|conf|txt|png|jpe?g|gif|svg|ico|webp|bmp|tiff?))/g, type: 'referenced_file' },
          { regex: /`([^`]*\.(tsx|jsx|typescript|javascript|json|html|scss|css|yaml|yml|jpeg|tiff|tsx?|jsx?|js|html?|md|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|sql|xml|toml|ini|conf|txt|png|jpe?g|gif|svg|ico|webp|bmp|tiff?))`/g, type: 'referenced_file' },
          { regex: /`([^`]+)`/g, type: 'code' },
          { regex: /\*\*([^*]+)\*\*/g, type: 'bold' },
          { regex: /\*([^*\s][^*]*[^*\s]|\S)\*/g, type: 'italic' } // Prevent matching ** inside *
        ];
        
        // Find all matches across all patterns
        const allMatches: Array<{ index: number; length: number; content: string; type: string }> = [];
        
        patterns.forEach(pattern => {
          let match;
          const regex = new RegExp(pattern.regex);
          while ((match = regex.exec(text)) !== null) {
            allMatches.push({
              index: match.index,
              length: match[0].length,
              content: match[1], // The captured group content
              type: pattern.type
            });
          }
        });
        
        // Sort matches by index to process them in order
        allMatches.sort((a, b) => a.index - b.index);
        
        // Remove overlapping matches (prefer the first one)
        const validMatches = [];
        for (let i = 0; i < allMatches.length; i++) {
          const current = allMatches[i];
          const hasOverlap = validMatches.some(existing => 
            current.index < existing.index + existing.length &&
            current.index + current.length > existing.index
          );
          if (!hasOverlap) {
            validMatches.push(current);
          }
        }
        
        // Build the elements
        validMatches.forEach(match => {
          // Add text before the match
          if (match.index > currentIndex) {
            elements.push(text.substring(currentIndex, match.index));
          }
          
          // Add the formatted element
          if (match.type === 'referenced_file') {
            elements.push(
              <code 
                key={match.index} 
                className="message-inline-code referenced_file"
                onClick={() => onFileReferenceClick?.(match.content)}
                style={{ cursor: 'pointer' }}
                title={`Click to highlight ${match.content} in file tree`}
              >
                <span className="file-icon">{getFileIcon(match.content)}</span>
                <span className="file-name">{match.content}</span>
              </code>
            );
          } else if (match.type === 'code') {
            elements.push(
              <code key={match.index} className="message-inline-code">
                {match.content}
              </code>
            );
          } else if (match.type === 'bold') {
            elements.push(
              <strong key={match.index} className="message-bold">
                {match.content}
              </strong>
            );
          } else if (match.type === 'italic') {
            elements.push(
              <em key={match.index} className="message-italic">
                {match.content}
              </em>
            );
          }
          
          currentIndex = match.index + match.length;
        });
        
        // Add remaining text
        if (currentIndex < text.length) {
          elements.push(text.substring(currentIndex));
        }
        
        return elements.length > 0 ? elements : [text];
      };
      
      // Split content by lines and process each line for headers
      const lines = part.content.split('\n');
      const formattedLines = lines.map((line, lineIndex) => {
        if (line.trim() === '') {
          return <br key={`br-${lineIndex}`} />;
        }
        return formatLineContent(line, lineIndex);
      });

      return (
        <div key={index} className="message-text" style={{ whiteSpace: 'pre-wrap' }}>
          {formattedLines}
        </div>
      );
    }
  });
};

interface Message {
  id?: string;
  sender: 'user' | 'claude';
  text: string;
  images?: {
    id: string;
    filename: string;
    url: string;
    thumbnailUrl: string;
  }[];
  isThinking?: boolean;
  diffData?: DiffData;
  permissionRequest?: PermissionRequestData;
  permissionAlert?: {
    missingPermissions: string[];
    actions: string[];
  };
}

interface ToolNotification {
  type: 'tool_usage';
  tool: string;
  path: string;
  id?: string;
  completed?: boolean;
  timestamp?: number;
  permissionRequest?: PermissionRequestData;
}

interface MessageListProps {
  messages: Message[];
  isThinking?: boolean;
  thinkingContent?: string;
  toolNotifications?: ToolNotification[];
  onPermissionResponse?: (permissionId: string, response: PermissionResponse) => void;
  onOpenSettings?: () => void;
  onFileReferenceClick?: (filename: string) => void;
}

const MessageList: React.FC<MessageListProps> = ({ messages, isThinking = false, thinkingContent = '', toolNotifications = [], onPermissionResponse, onOpenSettings, onFileReferenceClick }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  // Track if user is near bottom using IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting;
        setIsNearBottom(isVisible);
        if (isVisible) {
          setShouldAutoScroll(true);
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    if (messagesEndRef.current) {
      observer.observe(messagesEndRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Auto-scroll when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (shouldAutoScroll && isNearBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'end' 
      });
    }
  }, [messages, isThinking, toolNotifications, shouldAutoScroll, isNearBottom]);

  // Handle manual scroll to detect if user scrolled up
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // If user scrolled up more than 100px from bottom, disable auto-scroll
      if (distanceFromBottom > 100) {
        setShouldAutoScroll(false);
      }
    }
  };
  const getToolIcon = (tool: string) => {
    switch (tool.toLowerCase()) {
      case 'read':
        return '🔍';
      case 'write':
      case 'creating':
        return '✏️';
      case 'edit':
      case 'editing':
        return '🔧';
      case 'bash':
      case 'running':
        return '⚡';
      case 'ls':
      case 'listing':
        return '📁';
      case 'grep':
      case 'glob':
      case 'searching':
      case 'finding':
        return '🔎';
      case 'todowrite':
      case 'todoread':
      case 'updating todo list':
      case 'reading todo list':
        return '📝';
      case 'task':
      case 'starting task':
        return '🎯';
      default:
        return '🔧';
    }
  };

  const getToolType = (tool: string) => {
    switch (tool.toLowerCase()) {
      case 'read':
        return 'read';
      case 'write':
      case 'creating':
        return 'write';
      case 'edit':
      case 'editing':
        return 'edit';
      case 'bash':
      case 'running':
        return 'bash';
      case 'ls':
      case 'listing':
      case 'grep':
      case 'glob':
      case 'searching':
      case 'finding':
        return 'search';
      case 'todowrite':
      case 'todoread':
      case 'updating todo list':
      case 'reading todo list':
        return 'todo';
      case 'task':
      case 'starting task':
        return 'task';
      default:
        return 'read';
    }
  };

  const formatPath = (path: string, projectPath?: string) => {
    if (!path) return '';
    
    // Remove common prefixes to make paths more readable
    let displayPath = path;
    
    // Remove absolute path prefixes
    if (path.startsWith('/home/') || path.startsWith('/Users/')) {
      const parts = path.split('/');
      const projectIndex = parts.findIndex(part => part === 'projects' || part === 'workspace' || part === 'src');
      if (projectIndex >= 0) {
        displayPath = parts.slice(projectIndex + 1).join('/');
      } else {
        // Fallback: just show last 3 parts
        displayPath = parts.slice(-3).join('/');
      }
    }
    
    // If still too long, truncate intelligently
    if (displayPath.length > 50) {
      const parts = displayPath.split('/');
      if (parts.length > 3) {
        displayPath = `.../${parts.slice(-2).join('/')}`;
      } else {
        displayPath = `...${displayPath.slice(-40)}`;
      }
    }
    
    return displayPath;
  };


  return (
    <div 
      className="message-list" 
      ref={scrollContainerRef}
      onScroll={handleScroll}
    >
      {messages.length === 0 ? (
        <div className="message-list__empty">
          Start the conversation with Claude…
        </div>
      ) : (
        <>
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`message-list__message message-list__message--${msg.sender} ${msg.isThinking ? 'message-list__message--thinking' : ''}`}>
              {msg.sender === 'claude' && (
                <div className="message-list__avatar">
                  <img src={claudeLogo} alt="Claude" className="message-list__avatar-img" />
                </div>
              )}
              <div className={`message-list__bubble ${msg.isThinking ? 'message-list__bubble--thinking-message' : ''}`}>
                {msg.images && msg.images.length > 0 && (
                  <div className="message-list__images">
                    {msg.images.map((image, imgIdx) => (
                      <div key={image.id || imgIdx} className="message-list__image-container">
                        <img 
                          src={image.thumbnailUrl} 
                          alt={image.filename}
                          className="message-list__image"
                          onClick={() => window.open(image.url, '_blank')}
                          title={`Click to view full size: ${image.filename}`}
                        />
                        <div className="message-list__image-filename">{image.filename}</div>
                      </div>
                    ))}
                  </div>
                )}
                {msg.diffData ? (
                  <DiffDisplay diff={msg.diffData} />
                ) : msg.permissionRequest ? (
                  <PermissionRequest 
                    request={msg.permissionRequest}
                    onResponse={(response) => {
                      if (onPermissionResponse) {
                        onPermissionResponse(msg.permissionRequest!.id, response);
                      }
                    }}
                  />
                ) : msg.permissionAlert ? (
                  <PermissionAlert 
                    missingPermissions={msg.permissionAlert.missingPermissions}
                    onOpenSettings={() => {
                      if (onOpenSettings) {
                        onOpenSettings();
                      }
                    }}
                  />
                ) : (
                  renderFormattedMessage(msg.text)
                )}
              </div>
            </div>
          ))}
          {toolNotifications.map((notification, idx) => {
            // Handle permission requests specially
            if (notification.permissionRequest) {
              console.log('Rendering permission request:', notification.permissionRequest.id);
              return (
                <div 
                  key={notification.id || `permission-${idx}`}
                  className="message-list__message message-list__message--claude"
                  style={{ marginTop: '8px' }}
                >
                  <div className="message-list__avatar">
                    <img src={claudeLogo} alt="Claude" className="message-list__avatar-img" />
                  </div>
                  <div className="message-list__bubble">
                    <PermissionRequest 
                      request={notification.permissionRequest}
                      onResponse={(response) => {
                        console.log('Permission response clicked:', response, 'for ID:', notification.permissionRequest!.id);
                        if (onPermissionResponse) {
                          onPermissionResponse(notification.permissionRequest!.id, response);
                        }
                      }}
                    />
                  </div>
                </div>
              );
            }

            // Handle regular tool notifications
            const toolType = getToolType(notification.tool);
            const displayPath = formatPath(notification.path);
            const fullPath = notification.path;
            const isCompleted = notification.completed;
            
            return (
              <div 
                key={notification.id || `tool-${idx}`} 
                className={`tool-notification tool-notification--${toolType} ${isCompleted ? 'tool-notification--completed' : ''}`}
              >
                <span className="tool-icon">
                  {isCompleted ? '✅' : getToolIcon(notification.tool)}
                </span>
                <span className="tool-action">{notification.tool}:</span>
                <code className="tool-path" title={fullPath}>{displayPath}</code>
                {isCompleted && <span className="tool-status">Done</span>}
              </div>
            );
          })}
          {isThinking && (
            <div className="message-list__message message-list__message--claude">
              <div className="message-list__avatar">
                <img src={claudeLogo} alt="Claude" className="message-list__avatar-img" />
              </div>
              <div className="message-list__bubble message-list__bubble--thinking">
                <div className="thinking-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                {thinkingContent || 'Claude is thinking...'}
              </div>
            </div>
          )}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;