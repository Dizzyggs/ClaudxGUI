import React, { useEffect, useState, useRef } from 'react';
import './index.css';
import Header from './components/layout/Header/Header';
import Sidebar from './components/layout/Sidebar/Sidebar';
import ChatInterface from './components/chat/ChatInterface/ChatInterface';
import WelcomeScreen from './components/ui/WelcomeScreen/WelcomeScreen';
import FolderDialog from './components/ui/FolderDialog/FolderDialog';
import ConfirmDialog from './components/ui/ConfirmDialog/ConfirmDialog';
import SettingsPage from './components/ui/SettingsPage/SettingsPage';
import ProjectEditModal from './components/ui/ProjectEditModal/ProjectEditModal';
import type { DiffData } from './components/ui/DiffDisplay/types';
import type { PermissionResponse } from './components/ui/PermissionRequest/PermissionRequest';

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
  permissionAlert?: {
    missingPermissions: string[];
    actions: string[];
  };
  diffData?: DiffData;
  permissionRequest?: PermissionRequestData;
}

interface PermissionRequestData {
  id: string;
  type: 'file_write' | 'file_edit' | 'file_delete' | 'bash_command' | 'network' | 'system';
  action: string;
  command?: string;
  reason?: string;
  filePath?: string;
  riskLevel: 'low' | 'medium' | 'high';
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

const WS_URL = 'ws://localhost:3001/ws';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettingsPage, setShowSettingsPage] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [toolNotifications, setToolNotifications] = useState<ToolNotification[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileTreeRefresh, setFileTreeRefresh] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [canAbort, setCanAbort] = useState(false);
  const [pendingPermission, setPendingPermission] = useState(false);
  const [sessionPermissions, setSessionPermissions] = useState<{[key: string]: any}>({});
  const [currentlyTyping, setCurrentlyTyping] = useState<string>('');
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [thinkingContent, setThinkingContent] = useState<string>('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [currentOperationSummary, setCurrentOperationSummary] = useState<string>('');
  const ws = useRef<WebSocket | null>(null);


  // Handle permission responses
  const handlePermissionResponse = (permissionId: string, response: PermissionResponse) => {
    console.log('Permission response:', permissionId, response);
    console.log('Current toolNotifications:', toolNotifications);
    
    // Clear pending permission state to resume execution
    setPendingPermission(false);
    setThinkingContent('');
    
    // Remove the permission request from tool notifications FIRST
    setToolNotifications(prev => {
      const permissionNotification = prev.find(n => 
        n.permissionRequest?.id === permissionId
      );
      
      // Update session permissions if user chose "allow_session" or "allow_once"
      if ((response === 'allow_session' || response === 'allow_once') && permissionNotification?.permissionRequest) {
        const permissionType = permissionNotification.permissionRequest.type;
        const permissionLabel = getPermissionLabel(permissionType);
        
        setSessionPermissions(currentPerms => ({
          ...currentPerms,
          [permissionType]: response === 'allow_session' ? 'session' : 'once',
          [`${permissionType}_label`]: permissionLabel,
          [`${permissionType}_granted_at`]: new Date().toISOString()
        }));
      }
      
      // Filter out the permission request
      const filtered = prev.filter(notif => notif.permissionRequest?.id !== permissionId);
      console.log('Removing permission request, new length:', filtered.length);
      return filtered;
    });
    
    // Send response to server
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'permission_response',
        permissionId,
        response,
        sessionId: activeSessionId
      }));
    }
  };

  // Helper function to get human-readable permission labels
  const getPermissionLabel = (type: string): string => {
    switch (type) {
      case 'file_write': return 'Create Files';
      case 'file_edit': return 'Edit Files';
      case 'file_delete': return 'Delete Files';
      case 'bash_command': return 'Run Terminal Commands';
      case 'network': return 'Network Access';
      case 'system': return 'System Access';
      default: return type;
    }
  };

  // Clear all session permissions
  const handleClearPermissions = () => {
    setSessionPermissions({});
  };

  useEffect(() => {
    fetch('http://localhost:3001/api/projects')
      .then((res) => res.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load chat history when project is selected
  const loadChatHistory = async (projectId: string) => {
    try {
      console.log('Loading chat history for project:', projectId);
      const response = await fetch(`http://localhost:3001/api/projects/${projectId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          sender: msg.sender,
          text: msg.text,
          images: msg.images?.length > 0 ? msg.images.map((img: any) => ({
            id: img.id,
            filename: img.filename,
            url: `http://localhost:3001${img.url}`,
            thumbnailUrl: `http://localhost:3001${img.thumbnailUrl}`
          })) : undefined
        }));
        console.log('Setting messages to:', formattedMessages);
        setMessages(formattedMessages);
        console.log('Loaded chat history:', formattedMessages.length, 'messages');
      } else {
        console.error('Failed to load chat history:', response.statusText);
        setMessages([]); // Clear messages on error
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([]); // Clear messages on error
    }
  };

  useEffect(() => {
    if (!selectedProject) {
      setMessages([]); // Clear messages when no project selected
      return;
    }
    
    // Load chat history first
    loadChatHistory(selectedProject.id);
    
    console.log('Connecting to WebSocket for project:', selectedProject.name);
    ws.current = new window.WebSocket(WS_URL);
    
    // Add event listener for settings changes
    const handleSettingsChanged = (event: CustomEvent) => {
      console.log('Settings changed, syncing to server:', event.detail);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'settings_update',
          settings: event.detail
        }));
      }
    };
    
    window.addEventListener('settingsChanged', handleSettingsChanged as EventListener);
    
    ws.current.onopen = () => {
      console.log('WebSocket connected');
      // Send project info to server
      ws.current?.send(JSON.stringify({
        type: 'project_selected',
        project: selectedProject
      }));
    };
    
    ws.current.onmessage = (event) => {
      console.log('🔍 FRONTEND: RAW EVENT DATA:', event.data);
      
      try {
        const data = JSON.parse(event.data);
        console.log('🔍 FRONTEND: PARSED DATA TYPE:', data.type);
        console.log('🔍 FRONTEND: FULL PARSED DATA:', data);
        
        // Special debug for security_status
        if (data.type === 'security_status') {
          console.log('🔒 FRONTEND: Security status message detected - SHOULD BE HANDLED!', data);
        }
        
        // Update active session tracking
        if (data.sessionId) {
          setActiveSessionId(data.sessionId);
        }
        
        if (data.type === 'claude_response') {
          console.log('🔍 FRONTEND: Received claude_response:', data.content);
          setIsThinking(false);
          setCanAbort(false);
          setActiveSessionId(null);
          
          // Mark any remaining uncompleted tools as completed first
          setToolNotifications(prev => 
            prev.map(notif => ({ ...notif, completed: true }))
          );
          
          // Mark any remaining operations as completed
          setOperations(prev => 
            prev.map(op => op.status === 'in_progress' ? { ...op, status: 'completed' } : op)
          );
          
          // Clear tool notifications after showing completed state for 2 seconds
          setTimeout(() => {
            setToolNotifications([]);
            setOperations([]);
            setCurrentOperationSummary('');
          }, 2000);
          setCurrentlyTyping('');
          setTypingMessageId(null);
          setThinkingContent('');
          
          // TEMPORARILY DISABLED: Remove tool messages from chat when response is complete
          // setTimeout(() => {
          //   setMessages(currentMessages => 
          //     currentMessages.filter(msg => !msg.id?.startsWith('tool-') && !msg.isThinking)
          //   );
          // }, 1000); // Keep tool messages visible for 1 second after response
          
          // Enhance completion messages with checkmarks and file references
          let enhancedContent = data.content;
          
          // Check if this is a completion/success message
          const isCompletionMessage = /^(Created|Updated|Added|Built|Implemented|Fixed|Completed|Successfully)/i.test(data.content);
          
          if (isCompletionMessage) {
            // Add checkmark to the beginning
            enhancedContent = `✅ ${data.content}`;
            
            // Find and format file paths to trigger reference styling
            enhancedContent = enhancedContent.replace(
              /([A-Za-z0-9_\-\.\/]+\.(tsx?|jsx?|js|css|scss|html?|json|md|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|sql|xml|yaml|yml|toml|ini|conf|txt|png|jpe?g|gif|svg|ico|webp|bmp|tiff?))\b/g,
              '@$1'
            );
          }
          
          console.log('Adding Claude response message');
          
          // Remove thinking messages before adding final response
          setMessages(currentMessages => 
            currentMessages.filter(msg => !msg.isThinking)
          );
          
          // Add final response with typing animation
          const responseId = `response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          setTypingMessageId(responseId);
          startTypingAnimation(enhancedContent, responseId, true);
          setMessages(currentMessages => [...currentMessages, { 
            id: responseId, 
            sender: 'claude' as const, 
            text: '' // Start with empty text for typing animation
          }]);
        } else if (data.type === 'claude_thinking') {
          console.log('Claude is thinking...');
          setIsThinking(true);
          setCanAbort(true);
          setCurrentlyTyping('');
          setTypingMessageId(null);
          setThinkingContent('');
        } else if (data.type === 'claude_thinking_text') {
          console.log('🔍 FRONTEND: Received claude_thinking_text:', data.content);
          
          // Check if this thinking text looks like a tool operation
          const toolOperationMatch = data.content.match(/^(Reading|Creating|Editing|Running|Listing|Searching|Finding|Updating todo list|Reading todo list|Starting task):\s*(.+)/);
          
          if (toolOperationMatch) {
            console.log('🔍 FRONTEND: Detected tool operation in thinking text:', toolOperationMatch);
            // This is actually a tool operation, treat it as such
            const [, action, pathOrContent] = toolOperationMatch;
            const actionToTool = {
              'Reading': 'Read',
              'Creating': 'Write', 
              'Editing': 'Edit',
              'Running': 'Bash',
              'Listing': 'LS',
              'Searching': 'Grep',
              'Finding': 'Glob',
              'Updating todo list': 'TodoWrite',
              'Reading todo list': 'TodoRead',
              'Starting task': 'Task'
            };
            const tool = actionToTool[action] || action;
            const path = pathOrContent;
            
            if (tool && path) {
              console.log('🔍 FRONTEND: Creating tool notification for:', tool, path);
              const toolId = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              setToolNotifications(prev => [...prev, { 
                type: 'tool_usage', 
                tool, 
                path, 
                id: toolId, 
                completed: false, 
                timestamp: Date.now() 
              }]);
              
              // Refresh file tree after write operations
              if (tool.toLowerCase() === 'write' || tool.toLowerCase() === 'creating') {
                setTimeout(() => {
                  setFileTreeRefresh(prev => prev + 1);
                }, 500);
              }
            }
            return; // Don't process as thinking text
          }
          
          // Filter out raw JSON content first
          let cleanContent = data.content;
          try {
            // If it looks like JSON, try to parse it and show a clean message
            if (data.content.trim().startsWith('{') || data.content.trim().startsWith('[')) {
              JSON.parse(data.content.trim());
              cleanContent = 'Working...';
            }
          } catch {
            // Not JSON, use as is
            cleanContent = data.content;
          }
          
          // Add thinking message with typing animation if it's substantial content
          if (cleanContent.length > 10 && !cleanContent.startsWith('Working')) {
            const thinkingId = `thinking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            setMessages(currentMessages => [...currentMessages, { 
              id: thinkingId, 
              sender: 'claude' as const, 
              text: '',
              isThinking: true
            }]);
            startTypingAnimation(cleanContent, thinkingId, true);
          } else {
            // For short messages or "Working...", just update thinking content
            setThinkingContent(cleanContent);
          }
        } else if (data.type === 'claude_tool_use') {
          console.log('🔍 FRONTEND: Received claude_tool_use:', data.content);
          // Parse the tool usage notification - handle both new and old formats
          let tool, path;
          
          // New format: "Reading: file.tsx", "Creating: file.tsx", etc.
          const newFormatMatch = data.content.match(/^(Reading|Creating|Editing|Running|Listing|Searching|Finding|Updating todo list|Reading todo list|Starting task):\s*(.+)/);
          // Old format: "Using Tool: path"
          const oldFormatMatch = data.content.match(/Using (\w+):\s*(.+)/);
          
          if (newFormatMatch) {
            const [, action, pathOrContent] = newFormatMatch;
            // Map actions to tool names
            const actionToTool = {
              'Reading': 'Read',
              'Creating': 'Write', 
              'Editing': 'Edit',
              'Running': 'Bash',
              'Listing': 'LS',
              'Searching': 'Grep',
              'Finding': 'Glob',
              'Updating todo list': 'TodoWrite',
              'Reading todo list': 'TodoRead',
              'Starting task': 'Task'
            };
            tool = actionToTool[action] || action;
            path = pathOrContent;
          } else if (oldFormatMatch) {
            [, tool, path] = oldFormatMatch;
          }
          
          if (tool && path) {
            console.log('🔍 FRONTEND: Creating tool notification from claude_tool_use for:', tool, path);
            const toolId = `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            setToolNotifications(prev => [...prev, { 
              type: 'tool_usage', 
              tool, 
              path, 
              id: toolId, 
              completed: false, 
              timestamp: Date.now() 
            }]);
            
            // Refresh file tree after write operations
            if (tool.toLowerCase() === 'write' || tool.toLowerCase() === 'creating') {
              setTimeout(() => {
                setFileTreeRefresh(prev => prev + 1);
              }, 500);
            }
          } else {
            console.log('Tool message did not match expected format:', data.content);
          }
        } else if (data.type === 'claude_tool_result') {
          console.log('Tool result:', data.content);
          
          // Mark the most recent matching tool notification as completed
          setToolNotifications(prev => {
            const updated = [...prev];
            // Find the most recent uncompleted notification and mark it as completed
            for (let i = updated.length - 1; i >= 0; i--) {
              if (!updated[i].completed) {
                updated[i] = { ...updated[i], completed: true };
                break;
              }
            }
            return updated;
          });
          
          // Refresh file tree if files were created/modified
          if (data.content.includes('File created') || data.content.includes('successfully')) {
            setFileTreeRefresh(prev => prev + 1);
          }
        } else if (data.type === 'claude_error') {
          console.log('Adding Claude error to messages:', data.content);
          setIsThinking(false);
          setCanAbort(false);
          setActiveSessionId(null);
          setToolNotifications([]); // Clear tool notifications on error
          setCurrentlyTyping('');
          setTypingMessageId(null);
          setThinkingContent('');
          setMessages((msgs) => [...msgs, { id: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, sender: 'claude', text: `Error: ${data.content}` }]);
        } else if (data.type === 'permission_alert') {
          console.log('Adding permission alert to messages:', data.content);
          setIsThinking(false);
          setCanAbort(false);
          setActiveSessionId(null);
          setToolNotifications([]); // Clear tool notifications
          setCurrentlyTyping('');
          setTypingMessageId(null);
          setThinkingContent('');
          setMessages((msgs) => [...msgs, { 
            id: `permission-alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
            sender: 'claude', 
            text: data.content.message,
            permissionAlert: {
              missingPermissions: data.content.missingPermissions,
              actions: data.content.actions
            }
          }]);
        } else if (data.type === 'claude_status') {
          console.log('Adding Claude status to messages:', data.content);
          setIsThinking(false);
          setCanAbort(false);
          setActiveSessionId(null);
          setMessages((msgs) => [...msgs, { sender: 'claude', text: `Status: ${data.content}` }]);
        } else if (data.type === 'file_diff') {
          console.log('Received file diff:', data.content);
          // Add diff display as a message
          const diffId = `diff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          setMessages(currentMessages => [...currentMessages, { 
            id: diffId, 
            sender: 'claude' as const, 
            text: '', // Text will be empty as we'll render the diff component
            diffData: data.content
          }]);
          
          // Refresh file tree after file operations
          setTimeout(() => {
            setFileTreeRefresh(prev => prev + 1);
          }, 500);
        } else if (data.type === 'permission_request') {
          console.log('Received permission request:', data.content);
          // Set pending permission state to block further execution
          setPendingPermission(true);
          setThinkingContent('Waiting for user to grant access...');
          
          // Add permission request as a special notification rather than a message
          const permissionNotification: ToolNotification = {
            type: 'tool_usage',
            tool: 'Permission',
            path: data.content.action || 'Unknown action',
            id: `permission-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            completed: false,
            timestamp: Date.now(),
            permissionRequest: data.content
          };
          setToolNotifications(prev => [...prev, permissionNotification]);
        } else if (data.type === 'request_settings') {
          console.log('Server requesting current settings');
          // Send current settings from localStorage to server
          const savedSettings = localStorage.getItem('claudeToolsSettings');
          if (savedSettings && ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
              type: 'settings_update',
              settings: JSON.parse(savedSettings)
            }));
          }
        } else if (data.type === 'claude_operation') {
          console.log('New operation started:', data.content);
          const operation: Operation = {
            id: data.content.id,
            type: data.content.type,
            action: data.content.action,
            file: data.content.file,
            status: data.content.status,
            timestamp: data.content.timestamp,
            details: data.content.details
          };
          setOperations(prev => [...prev, operation]);
          setCurrentOperationSummary(`${operation.action}...`);
        } else if (data.type === 'claude_operation_complete') {
          console.log('Operation completed:', data.content);
          setOperations(prev => prev.map(op => 
            op.id === data.content.id 
              ? { ...op, status: data.content.status, result: data.content.result }
              : op
          ));
          
          // Clear summary when operations complete
          setTimeout(() => {
            setCurrentOperationSummary('');
          }, 2000);
        } else if (data.type === 'security_status') {
          console.log('🔒 FRONTEND: Security status handled properly:', data.content);
          // Handle security status updates silently - no need to show in chat
          // These are just informational status messages about filesystem protection
        } else if (data.type === 'security_violation') {
          console.log('🚨 FRONTEND: Security violation detected:', data.content);
          // Add security violation message to chat to alert user
          const violationMessage = {
            id: `security-violation-${Date.now()}`,
            sender: 'claude' as const,
            text: `🚨Your request requires editing permissions.\n\nGo ahead and head over to settings and give claude the "Editing" permission!`
          };
          setMessages(msgs => [...msgs, violationMessage]);
          
          // Stop thinking state since Claude was terminated
          setIsThinking(false);
          setCanAbort(false);
          setActiveSessionId(null);
          setToolNotifications([]);
          setThinkingContent('');
        } else if (data.type === 'file_change') {
          console.log('📁 FRONTEND: File change detected:', data.content);
          
          // Trigger file tree refresh
          setFileTreeRefresh(prev => prev + 1);
          
          // Optional: Show notification based on change type
          if (data.content.changeType === 'file_created') {
            console.log('✨ New file created:', data.content.filePath);
          } else if (data.content.changeType === 'file_deleted') {
            console.log('🗑️ File deleted:', data.content.filePath);
          } else if (data.content.changeType === 'file_modified') {
            console.log('📝 File modified:', data.content.filePath);
          }
        } else {
          console.log('🔍 FRONTEND: Unhandled message type:', data.type, data);
        }
      } catch (e) {
        console.log('🚨 FRONTEND: JSON PARSE ERROR - THIS IS WHY RAW JSON APPEARS!');
        console.log('🚨 ERROR:', e);
        console.log('🚨 RAW DATA:', event.data);
        console.log('🚨 DATA TYPE:', typeof event.data);
        // COMMENT OUT THE LINE THAT ADDS RAW JSON TO CHAT
        // setMessages((msgs) => [...msgs, { sender: 'claude', text: event.data }]);
        console.log('🚨 BLOCKED RAW JSON FROM APPEARING IN CHAT');
      }
    };
    
    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.current.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    return () => {
      ws.current?.close();
      window.removeEventListener('settingsChanged', handleSettingsChanged as EventListener);
    };
  }, [selectedProject]);

  const startTypingAnimation = (text: string, messageId: string, isFinalResponse: boolean = false) => {
    let currentIndex = 0;
    const typingSpeed = 5; // milliseconds per character - much faster
    
    const typeNextCharacter = () => {
      if (currentIndex < text.length) {
        const partialText = text.substring(0, currentIndex + 1);
        setCurrentlyTyping(partialText);
        
        if (isFinalResponse) {
          // Update existing message if it's a final response
          setMessages(msgs => {
            const existingIndex = msgs.findIndex(m => m.id === messageId);
            if (existingIndex >= 0) {
              const updated = [...msgs];
              updated[existingIndex] = { ...updated[existingIndex], text: partialText };
              return updated;
            }
            return msgs; // Don't create new message here, it should already exist
          });
        }
        
        currentIndex++;
        setTimeout(typeNextCharacter, typingSpeed);
      } else {
        // Typing complete
        setCurrentlyTyping('');
        setTypingMessageId(null);
        
        if (isFinalResponse) {
          // Ensure final message is properly set
          setMessages(msgs => {
            const existingIndex = msgs.findIndex(m => m.id === messageId);
            if (existingIndex >= 0) {
              const updated = [...msgs];
              updated[existingIndex] = { ...updated[existingIndex], text: text };
              return updated;
            }
            return msgs; // Don't create new message here, it should already exist
          });
        }
      }
    };
    
    typeNextCharacter();
  };

  const uploadImages = async (images: File[], projectId: string): Promise<any[]> => {
    console.log('Starting upload of', images.length, 'images');
    
    const uploadPromises = images.map(async (image, index) => {
      console.log(`Uploading image ${index + 1}:`, image.name, 'Type:', image.type, 'Size:', image.size);
      
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            console.log(`Sending upload request for image ${index + 1}`);
            const response = await fetch(`http://localhost:3001/api/projects/${projectId}/images/clipboard`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                imageData: reader.result,
                mimeType: image.type,
                filename: image.name || `pasted-image-${index + 1}.${image.type.split('/')[1]}`
              })
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log(`Image ${index + 1} uploaded successfully:`, data.image);
              resolve(data.image);
            } else {
              const errorText = await response.text();
              console.error(`Failed to upload image ${index + 1}:`, response.status, errorText);
              reject(new Error(`Failed to upload image: ${response.status} ${errorText}`));
            }
          } catch (error) {
            console.error(`Error uploading image ${index + 1}:`, error);
            reject(error);
          }
        };
        
        reader.onerror = () => {
          console.error(`Failed to read image ${index + 1}`);
          reject(new Error('Failed to read image file'));
        };
        
        reader.readAsDataURL(image);
      });
    });
    
    try {
      const results = await Promise.all(uploadPromises);
      console.log('All images uploaded successfully:', results);
      return results;
    } catch (error) {
      console.error('Error in uploadImages:', error);
      throw error;
    }
  };

  const sendMessage = async (images?: File[], mentionedFiles?: string[]) => {
    if ((!input.trim() && !images?.length) || !ws.current || ws.current.readyState !== 1 || !selectedProject) {
      console.log('Cannot send message:', {
        hasInput: !!input.trim(),
        hasImages: !!images?.length,
        wsReady: ws.current?.readyState === 1,
        hasProject: !!selectedProject
      });
      return;
    }
    
    let uploadedImages: any[] = [];
    
    // Upload images if any
    if (images && images.length > 0) {
      try {
        setUploadingImages(true);
        console.log('Starting image upload process...');
        uploadedImages = await uploadImages(images, selectedProject.id);
        console.log('Images uploaded successfully:', uploadedImages);
      } catch (error) {
        console.error('Error uploading images:', error);
        alert(`Failed to upload images: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      } finally {
        setUploadingImages(false);
      }
    }
    
    // Create message content
    let messageContent = input.trim();
    if (uploadedImages.length > 0) {
      messageContent = messageContent || 'Analyze this image:';
      console.log('Message content with images:', messageContent);
    }
    
    const message = {
      type: 'user_message',
      content: messageContent,
      project: selectedProject,
      images: uploadedImages.length > 0 ? uploadedImages : undefined,
      mentionedFiles: mentionedFiles && mentionedFiles.length > 0 ? mentionedFiles : undefined
    };
    
    console.log('Sending WebSocket message:', message);
    
    ws.current.send(JSON.stringify(message));
    
    // Add message to UI with images
    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sender: 'user',
      text: messageContent,
      images: uploadedImages.length > 0 ? uploadedImages.map(img => ({
        id: img.id,
        filename: img.filename,
        url: `http://localhost:3001${img.url}`,
        thumbnailUrl: `http://localhost:3001${img.thumbnailUrl}`
      })) : undefined
    };
    
    console.log('Adding message to UI:', userMessage);
    setMessages((msgs) => [...msgs, userMessage]);
    setInput('');
  };

  const abortCurrentSession = () => {
    if (activeSessionId && ws.current && ws.current.readyState === 1) {
      console.log('Aborting session:', activeSessionId);
      const message = {
        type: 'abort_session',
        sessionId: activeSessionId
      };
      ws.current.send(JSON.stringify(message));
      setIsThinking(false);
      setCanAbort(false);
      setActiveSessionId(null);
      setToolNotifications([]);
      setThinkingContent('');
    }
  };

  const handleNewProject = () => {
    setShowFolderDialog(true);
  };

  const handleCreateProject = async (folderPath: string, projectName: string) => {
    console.log('Creating project:', { folderPath, projectName });
    try {
      const response = await fetch('http://localhost:3001/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: projectName, path: folderPath }),
      });

      console.log('Response status:', response.status);
      
      if (response.ok) {
        const newProject = await response.json();
        console.log('New project created:', newProject);
        setProjects(prev => [newProject, ...prev]);
        setSelectedProject(newProject);
        setMessages([]);
      } else {
        const errorData = await response.text();
        console.error('Failed to create project:', errorData);
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const handleOpenRecent = () => {
    // TODO: Implement recent projects dialog
    console.log('Opening recent projects...');
  };

  const handleDeleteProject = (project: Project) => {
    setProjectToDelete(project);
    setShowDeleteDialog(true);
  };

  const handleEditProject = (project: Project) => {
    setProjectToEdit(project);
    setShowEditModal(true);
  };

  const handleConfirmEditProject = async (projectId: string, newName: string, newPath: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName, path: newPath }),
      });

      if (response.ok) {
        const updatedProject = await response.json();
        
        // Update projects list
        setProjects(prev => prev.map(p => 
          p.id === projectId ? updatedProject : p
        ));
        
        // Update selected project if it's the one being edited
        if (selectedProject?.id === projectId) {
          setSelectedProject(updatedProject);
        }
        
        console.log('Project updated successfully');
      } else {
        const errorData = await response.text();
        console.error('Failed to update project:', errorData);
        alert('Failed to update project. Please try again.');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      alert('Failed to update project. Please check your connection and try again.');
    }
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setProjectToEdit(null);
  };

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath);
  };

  const handleFileClose = () => {
    setSelectedFile(null);
  };

  const handleFileReferenceClick = (filename: string) => {
    // Convert relative filename to full path if needed
    let fullPath = filename;
    if (selectedProject?.path && !filename.startsWith('/') && !filename.startsWith(selectedProject.path)) {
      fullPath = selectedProject.path + '/' + filename;
    }
    handleFileSelect(fullPath);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
        
        // If the deleted project was selected, clear the selection
        if (selectedProject?.id === projectToDelete.id) {
          setSelectedProject(null);
          setMessages([]);
        }
        
        console.log('Project deleted successfully');
      } else {
        console.error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
    
    setShowDeleteDialog(false);
    setProjectToDelete(null);
  };

  const cancelDeleteProject = () => {
    setShowDeleteDialog(false);
    setProjectToDelete(null);
  };

  return (
    <div className="app-container">
      <Header 
        onSettingsClick={() => setShowSettingsPage(true)}
        selectedProject={selectedProject}
      />
      <div className="app-body">
        <Sidebar
          projects={projects}
          loading={loading}
          selectedProject={selectedProject}
          onProjectSelect={(project) => {
            setSelectedProject(project);
            setShowSettingsPage(false);
          }}
          onNewProject={handleNewProject}
          onOpenRecent={handleOpenRecent}
          onDeleteProject={handleDeleteProject}
          onEditProject={handleEditProject}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          fileTreeRefresh={fileTreeRefresh}
        />
        <main className={`main-content ${showSettingsPage ? 'settings-active' : ''}`}>
        {showSettingsPage ? (
          <SettingsPage onClose={() => setShowSettingsPage(false)} />
        ) : !selectedProject ? (
          <WelcomeScreen onNewProject={handleNewProject} onOpenRecent={handleOpenRecent} />
        ) : (
          <ChatInterface
            selectedProject={selectedProject}
            messages={messages}
            input={input}
            onInputChange={setInput}
            onSendMessage={sendMessage}
            canSend={!!ws.current && ws.current.readyState === 1}
            isThinking={isThinking}
            thinkingContent={thinkingContent}
            toolNotifications={toolNotifications}
            operations={operations}
            operationSummary={currentOperationSummary}
            selectedFile={selectedFile}
            onFileClose={handleFileClose}
            canAbort={canAbort}
            onAbort={abortCurrentSession}
            uploadingImages={uploadingImages}
            websocket={ws.current}
            onPermissionResponse={handlePermissionResponse}
            sessionPermissions={sessionPermissions}
            onClearPermissions={handleClearPermissions}
            onFileReferenceClick={handleFileReferenceClick}
            onOpenSettings={() => setShowSettingsPage(true)}
            fileListRefresh={fileTreeRefresh}
          />
        )}
      </main>
      </div>
      
      <FolderDialog
        isOpen={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onConfirm={handleCreateProject}
      />
      
      <ConfirmDialog
        isOpen={showDeleteDialog}
        type="danger"
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"? This will remove all tracked changes, chat history, and project data. This action cannot be undone.`}
        confirmText="Delete Project"
        cancelText="Cancel"
        onConfirm={confirmDeleteProject}
        onCancel={cancelDeleteProject}
      />
      
      <ProjectEditModal
        isOpen={showEditModal}
        project={projectToEdit}
        onClose={handleCloseEditModal}
        onConfirm={handleConfirmEditProject}
      />
    </div>
  );
};

export default App;