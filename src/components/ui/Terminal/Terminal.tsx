import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './Terminal.scss';

export interface ShellProfile {
  id: string;
  name: string;
  type: 'wsl' | 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish';
  distro?: string;
  isAvailable: boolean;
  isDefault?: boolean;
}

export interface TerminalProps {
  websocket: WebSocket | null;
  projectPath?: string;
  selectedShell?: string;
  onShellChange?: (shellId: string) => void;
  isVisible?: boolean;
}

export interface TerminalSession {
  id: string;
  shellProfile: ShellProfile;
}

const Terminal: React.FC<TerminalProps> = ({
  websocket,
  projectPath,
  selectedShell,
  onShellChange,
  isVisible = true
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [shells, setShells] = useState<ShellProfile[]>([]);
  const [defaultShell, setDefaultShell] = useState<string>('');

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, Courier New, monospace',
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      lineHeight: 1.4,
      scrollback: 1000,
      theme: {
        // Dark theme matching ClaudxGUI
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#3b82f6',
        cursorAccent: '#1e293b',
        selection: 'rgba(59, 130, 246, 0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    
    xterm.open(terminalRef.current);
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Set up terminal event handlers
    xterm.onData((data) => {
      if (websocket && sessionRef.current) {
        websocket.send(JSON.stringify({
          type: 'terminal_input',
          sessionId: sessionRef.current.id,
          data
        }));
      }
    });

    // Handle terminal resize
    const handleResize = () => {
      if (fitAddon && websocket && session) {
        fitAddon.fit();
        const { cols, rows } = xterm;
        websocket.send(JSON.stringify({
          type: 'terminal_resize',
          sessionId: session.id,
          cols,
          rows
        }));
      }
    };

    // Set up resize observer
    const resizeObserver = new ResizeObserver(handleResize);
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initial fit
    setTimeout(() => {
      fitAddon.fit();
    }, 100);

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalRef.current]);

  // Fetch available shells
  useEffect(() => {
    const fetchShells = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/terminal/shells');
        const data = await response.json();
        setShells(data.shells || []);
        setDefaultShell(data.defaultShell || '');
      } catch (error) {
        console.error('Failed to fetch shells:', error);
      }
    };

    fetchShells();
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'terminal_created':
            const newSession = {
              id: data.sessionId,
              shellProfile: data.shellProfile
            };
            setSession(newSession);
            sessionRef.current = newSession;
            setIsConnected(true);
            console.log('Terminal session created:', data.sessionId);
            break;

          case 'terminal_output':
            if (xtermRef.current && data.sessionId === session?.id) {
              xtermRef.current.write(data.content);
            }
            break;

          case 'terminal_exit':
            setSession(null);
            sessionRef.current = null;
            setIsConnected(false);
            if (xtermRef.current) {
              xtermRef.current.write('\r\n\r\n[Terminal session ended]\r\n');
            }
            console.log('Terminal session ended');
            break;

          case 'terminal_error':
            console.error('Terminal error:', data.content);
            if (xtermRef.current) {
              xtermRef.current.write(`\r\n\r\n[Error: ${data.content}]\r\n`);
            }
            break;

          case 'terminal_destroyed':
            if (data.sessionId === session?.id) {
              setSession(null);
              sessionRef.current = null;
              setIsConnected(false);
            }
            break;
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.addEventListener('message', handleMessage);

    return () => {
      websocket.removeEventListener('message', handleMessage);
    };
  }, [websocket, session?.id]);

  // Create terminal session
  const createTerminalSession = useCallback((shellId?: string) => {
    if (!websocket) {
      console.error('WebSocket not available');
      return;
    }

    const shell = shellId || selectedShell || defaultShell;
    
    // Get terminal dimensions
    const cols = xtermRef.current?.cols || 80;
    const rows = xtermRef.current?.rows || 24;

    websocket.send(JSON.stringify({
      type: 'terminal_create',
      shellId: shell,
      cols,
      rows
    }));

    console.log('Creating terminal session with shell:', shell);
  }, [websocket, selectedShell, defaultShell]);

  // Destroy terminal session
  const destroyTerminalSession = useCallback(() => {
    if (!websocket || !session) return;

    websocket.send(JSON.stringify({
      type: 'terminal_destroy',
      sessionId: session.id
    }));
  }, [websocket, session]);

  // Auto-create session when component becomes visible and has websocket
  useEffect(() => {
    if (isVisible && websocket && websocket.readyState === WebSocket.OPEN && !session && shells.length > 0) {
      createTerminalSession();
    }
  }, [isVisible, websocket, session, shells.length, createTerminalSession]);

  // Handle shell change
  const handleShellChange = (shellId: string) => {
    if (session) {
      destroyTerminalSession();
    }
    setTimeout(() => {
      createTerminalSession(shellId);
      onShellChange?.(shellId);
    }, 100);
  };

  // Get current shell info
  const currentShell = session?.shellProfile || shells.find(s => s.id === (selectedShell || defaultShell));

  return (
    <div className={`terminal ${isVisible ? 'terminal--visible' : 'terminal--hidden'}`}>
      <div className="terminal__header">
        <div className="terminal__info">
          <div className="terminal__title">
            Terminal
            {currentShell && (
              <span className="terminal__shell-info">
                - {currentShell.name}
                {currentShell.distro && ` (${currentShell.distro})`}
              </span>
            )}
          </div>
          <div className="terminal__status">
            <div className={`terminal__status-indicator ${isConnected ? 'terminal__status-indicator--connected' : 'terminal__status-indicator--disconnected'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        
        <div className="terminal__controls">
          {shells.length > 0 && (
            <select 
              className="terminal__shell-selector"
              value={currentShell?.id || ''}
              onChange={(e) => handleShellChange(e.target.value)}
              disabled={!websocket}
            >
              {shells.map(shell => (
                <option key={shell.id} value={shell.id}>
                  {shell.name} {shell.distro ? `(${shell.distro})` : ''}
                </option>
              ))}
            </select>
          )}
          
          <button
            className="terminal__button terminal__button--new"
            onClick={() => createTerminalSession()}
            disabled={!websocket || isConnected}
            title="New Terminal"
          >
            ➕
          </button>
          
          <button
            className="terminal__button terminal__button--clear"
            onClick={() => xtermRef.current?.clear()}
            disabled={!isConnected}
            title="Clear Terminal"
          >
            🗑️
          </button>
          
          <button
            className="terminal__button terminal__button--destroy"
            onClick={destroyTerminalSession}
            disabled={!session}
            title="Close Terminal"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className="terminal__content">
        <div 
          ref={terminalRef} 
          className="terminal__xterm"
        />
        
        {!isConnected && (
          <div className="terminal__overlay">
            <div className="terminal__overlay-content">
              {websocket ? (
                <>
                  <div className="terminal__overlay-title">Terminal Ready</div>
                  <div className="terminal__overlay-subtitle">
                    Click "New Terminal" to start a session
                  </div>
                  <button
                    className="terminal__overlay-button"
                    onClick={() => createTerminalSession()}
                  >
                    Start Terminal
                  </button>
                </>
              ) : (
                <>
                  <div className="terminal__overlay-title">Terminal Unavailable</div>
                  <div className="terminal__overlay-subtitle">
                    WebSocket connection required
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Terminal;