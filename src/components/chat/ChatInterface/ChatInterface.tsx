import React, { useState } from 'react';
import MessageList from '../MessageList/MessageList';
import MessageInput from '../MessageInput/MessageInput';
import FileEditor from '../../ui/FileEditor/FileEditor';
import Terminal from '../../ui/Terminal/Terminal';
import PermissionStatus from '../../ui/PermissionStatus/PermissionStatus';
import OperationSummary from '../../ui/OperationSummary/OperationSummary';
import type { DiffData } from '../../ui/DiffDisplay/types';
import type { PermissionResponse, PermissionRequestData } from '../../ui/PermissionRequest/PermissionRequest';
import './ChatInterface.scss';

interface Project {
  id: string;
  name: string;
  path?: string;
}

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
}

interface ToolNotification {
  type: 'tool_usage';
  tool: string;
  path: string;
}

interface Operation {
  id: string;
  type: 'read' | 'write' | 'edit' | 'delete' | 'bash' | 'search';
  action: string;
  file: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
  details?: string;
  result?: string;
}

interface Tab {
  id: string;
  type: 'chat' | 'terminal';
  title: string;
  shellType?: string;
  sessionId?: string;
  isActive?: boolean;
}

interface ChatInterfaceProps {
  selectedProject: Project;
  messages: Message[];
  input: string;
  onInputChange: (value: string) => void;
  onSendMessage: (images?: File[], mentionedFiles?: string[]) => void;
  canSend: boolean;
  isThinking?: boolean;
  thinkingContent?: string;
  toolNotifications?: ToolNotification[];
  operations?: Operation[];
  operationSummary?: string;
  selectedFile?: string | null;
  onFileClose?: () => void;
  canAbort?: boolean;
  onAbort?: () => void;
  uploadingImages?: boolean;
  websocket?: WebSocket | null;
  onPermissionResponse?: (permissionId: string, response: PermissionResponse) => void;
  sessionPermissions?: {[key: string]: any};
  onClearPermissions?: () => void;
  onOpenSettings?: () => void;
  onFileReferenceClick?: (filename: string) => void;
  fileListRefresh?: number;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  selectedProject,
  messages,
  input,
  onInputChange,
  onSendMessage,
  canSend,
  isThinking = false,
  thinkingContent = '',
  toolNotifications = [],
  operations = [],
  operationSummary = '',
  selectedFile = null,
  onFileClose,
  canAbort = false,
  onAbort,
  uploadingImages = false,
  websocket = null,
  onPermissionResponse,
  sessionPermissions = {},
  onClearPermissions,
  onOpenSettings,
  onFileReferenceClick,
  fileListRefresh
}) => {
  // Tab state management
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: 'chat',
      type: 'chat',
      title: selectedProject.name || 'Chat',
      isActive: true
    }
  ]);
  const [activeTabId, setActiveTabId] = useState('chat');

  // Create new terminal tab
  const createTerminalTab = (shellType?: string) => {
    const terminalCount = tabs.filter(tab => tab.type === 'terminal').length;
    const newTab: Tab = {
      id: `terminal-${Date.now()}`,
      type: 'terminal',
      title: `Terminal ${terminalCount + 1}`,
      shellType,
      isActive: false
    };
    
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // Close tab
  const closeTab = (tabId: string) => {
    if (tabId === 'chat') return; // Don't allow closing chat tab
    
    setTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== tabId);
      // If closing active tab, switch to chat
      if (tabId === activeTabId) {
        setActiveTabId('chat');
      }
      return newTabs;
    });
  };

  // Switch to tab
  const switchToTab = (tabId: string) => {
    setActiveTabId(tabId);
  };

  // Update chat tab title when project changes
  React.useEffect(() => {
    setTabs(prev => prev.map(tab => 
      tab.id === 'chat' 
        ? { ...tab, title: selectedProject.name || 'Chat' }
        : tab
    ));
  }, [selectedProject.name]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
  return (
    <div className="chat-interface">
      {/* Tab Bar */}
      <div className="chat-interface__tabs">
        <div className="chat-interface__tab-list">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`chat-interface__tab ${activeTabId === tab.id ? 'chat-interface__tab--active' : ''} ${tab.type === 'terminal' ? 'chat-interface__tab--terminal' : ''}`}
              onClick={() => switchToTab(tab.id)}
            >
              <span className="chat-interface__tab-icon">
                {tab.type === 'chat' ? '💬' : '⚡'}
              </span>
              <span className="chat-interface__tab-title">{tab.title}</span>
              {tab.type === 'terminal' && (
                <button
                  className="chat-interface__tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  title="Close Terminal"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        
        <div className="chat-interface__tab-actions">
          <button
            className="chat-interface__new-terminal"
            onClick={() => createTerminalTab()}
            title="New Terminal"
          >
            ➕ Terminal
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="chat-interface__content">
        {activeTab.type === 'chat' ? (
          <>
            {selectedFile && onFileClose ? (
              <div className="chat-interface__editor">
                <FileEditor
                  filePath={selectedFile}
                  onClose={onFileClose}
                  onSave={(content) => {
                    // TODO: Handle file save
                    console.log('File saved:', selectedFile, content);
                  }}
                />
              </div>
            ) : (
              <div className="chat-interface__chat-content">
                {operations.length > 0 && (
                  <div className="chat-interface__operations">
                    <OperationSummary
                      operations={operations}
                      title={operationSummary || "Processing Operations"}
                      isExpanded={true}
                    />
                  </div>
                )}
                <MessageList 
                  messages={messages} 
                  isThinking={isThinking} 
                  thinkingContent={thinkingContent} 
                  toolNotifications={toolNotifications}
                  onPermissionResponse={onPermissionResponse}
                  onOpenSettings={onOpenSettings}
                  onFileReferenceClick={onFileReferenceClick}
                />
              </div>
            )}
          </>
        ) : (
          <Terminal
            websocket={websocket}
            projectPath={selectedProject.path}
            selectedShell={activeTab.shellType}
            isVisible={activeTab.id === activeTabId}
          />
        )}
      </div>
      
      {/* Permission Status - Only show for chat tab */}
      {activeTab.type === 'chat' && Object.keys(sessionPermissions).length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <PermissionStatus 
            sessionPermissions={sessionPermissions}
            onClearPermissions={onClearPermissions}
          />
        </div>
      )}
      
      {/* Input Area - Only show for chat tab */}
      {activeTab.type === 'chat' && (
        <MessageInput
          value={input}
          onChange={onInputChange}
          onSend={onSendMessage}
          canSend={canSend}
          canAbort={canAbort}
          onAbort={onAbort}
          uploadingImages={uploadingImages}
          projectPath={selectedProject.path}
          fileListRefresh={fileListRefresh}
        />
      )}
    </div>
  );
};

export default ChatInterface;