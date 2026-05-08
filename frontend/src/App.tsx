import { useState, useEffect, useCallback } from 'react';
import './App.css';
import {
  GetServices,
  GetWorkspaceRoot,
  RestartService,
  StartService,
  StopService,
  EnableService,
  OpenCogChat,
  GetKernelHealth,
} from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { Terminal } from './components/Terminal';

type ServiceStatus = main.ServiceStatus;

type Tab = 'terminal' | 'chat' | 'settings';

// Port assignments governed by: cog://conf/ports
// See: .cog/conf/ports.cog.md for canonical registry
const KERNEL_URL = 'http://localhost:6931';  // cog://conf/ports#kernel

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('terminal');
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [workspaceRoot, setWorkspaceRoot] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [debugMode, setDebugMode] = useState(false);
  const [debugLoading, setDebugLoading] = useState(true);

  const refreshServices = useCallback(async () => {
    try {
      const svcs = await GetServices();
      setServices(svcs);
    } catch (err) {
      console.error('Failed to get services:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    GetWorkspaceRoot().then(setWorkspaceRoot);
    refreshServices();

    // Refresh every 5 seconds
    const interval = setInterval(refreshServices, 5000);
    return () => clearInterval(interval);
  }, [refreshServices]);

  // Check if chat service is ready
  useEffect(() => {
    const cogChat = services.find(s => s.name === 'cog-chat');
    setChatReady(cogChat?.healthy ?? false);
  }, [services]);

  // Initialize theme and debug mode
  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('cog-theme');
    if (savedTheme) {
      try {
        const t = JSON.parse(savedTheme);
        setTheme(t);
        document.documentElement.classList.toggle('dark', t === 'dark');
      } catch {
        document.documentElement.classList.add('dark');
      }
    }

    // Fetch debug mode from kernel
    fetch(`${KERNEL_URL}/debug`)
      .then(res => res.json())
      .then(data => {
        setDebugMode(data.debug ?? false);
        setDebugLoading(false);
      })
      .catch(() => setDebugLoading(false));
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('cog-theme', JSON.stringify(newTheme));
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const toggleDebugMode = async () => {
    try {
      const res = await fetch(`${KERNEL_URL}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debug: !debugMode })
      });
      const data = await res.json();
      setDebugMode(data.debug ?? false);
    } catch (e) {
      console.error('Failed to toggle debug mode:', e);
    }
  };

  const handleRestart = async (name: string) => {
    setActionInProgress(name);
    setMessage(null);
    try {
      const result = await RestartService(name);
      // Wails returns multiple values as array [bool, string]
      const msg = Array.isArray(result) ? result[1] : String(result);
      setMessage(msg);
    } catch (err) {
      setMessage(String(err));
    }
    setTimeout(() => {
      refreshServices();
      setActionInProgress(null);
    }, 2000);
  };

  const handleStart = async (name: string) => {
    setActionInProgress(name);
    setMessage(null);
    try {
      const result = await StartService(name);
      const msg = Array.isArray(result) ? result[1] : String(result);
      setMessage(msg);
    } catch (err) {
      setMessage(String(err));
    }
    setTimeout(() => {
      refreshServices();
      setActionInProgress(null);
    }, 2000);
  };

  const handleEnable = async (name: string) => {
    setActionInProgress(name);
    setMessage(null);
    try {
      const result = await EnableService(name);
      const msg = Array.isArray(result) ? result[1] : String(result);
      setMessage(msg);
    } catch (err) {
      setMessage(String(err));
    }
    setTimeout(() => {
      refreshServices();
      setActionInProgress(null);
    }, 1000);
  };

  const handleOpenChat = async () => {
    try {
      const result = await OpenCogChat();
      const success = Array.isArray(result) ? result[0] : result;
      const msg = Array.isArray(result) ? result[1] : '';
      if (!success) {
        setMessage(String(msg));
      }
    } catch (err) {
      setMessage(String(err));
    }
  };

  const getStatusColor = (svc: ServiceStatus) => {
    if (svc.healthy) return '#22c55e'; // green
    if (svc.running) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  const getStatusText = (svc: ServiceStatus) => {
    if (svc.healthy) return 'Healthy';
    if (svc.running) return 'Running (unhealthy)';
    if (svc.launchd) return 'Stopped';
    return 'Not configured';
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="45" stroke="#a855f7" strokeWidth="4" fill="none" />
            <circle cx="50" cy="50" r="20" fill="#a855f7" />
            <circle cx="50" cy="50" r="8" fill="#1a1a2e" />
          </svg>
          <span className="title">CogOS</span>
        </div>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            Terminal
          </button>
          <button
            className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
            {chatReady && <span className="tab-dot healthy" />}
            {!chatReady && <span className="tab-dot offline" />}
          </button>
          <button
            className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </header>

      {/* Terminal Tab */}
      <div className="terminal-tab" style={{ display: activeTab === 'terminal' ? 'flex' : 'none', flex: 1 }}>
        <Terminal id="main" active={activeTab === 'terminal'} />
      </div>

      {/* Chat Tab - kept mounted to preserve state */}
      <div className="chat-container" style={{ display: activeTab === 'chat' ? 'flex' : 'none', flex: 1 }}>
        {chatReady ? (
          <iframe
            src="http://localhost:8765"  // cog://conf/ports#cog-chat
            className="chat-iframe"
            title="CogOS Chat"
          />
        ) : (
          <div className="chat-offline">
            <div className="offline-icon">
              <svg width="64" height="64" viewBox="0 0 100 100" fill="none">
                <circle cx="50" cy="50" r="45" stroke="#64748b" strokeWidth="4" fill="none" />
                <circle cx="50" cy="50" r="20" fill="#64748b" />
                <circle cx="50" cy="50" r="8" fill="#1a1a2e" />
              </svg>
            </div>
            <h3>Chat Service Offline</h3>
            <p>Start the cog-chat service to use the chat interface</p>
            <button
              className="big-btn primary"
              onClick={() => {
                setActiveTab('settings');
                handleStart('cog-chat');
              }}
            >
              Start Service
            </button>
          </div>
        )}
      </div>

      {activeTab === 'settings' && (
        <div className="launcher-container">
          {workspaceRoot && (
            <div className="workspace-info">
              <span className="label">Workspace:</span>
              <span className="path">{workspaceRoot}</span>
            </div>
          )}

          {message && (
            <div className="message">
              {message}
            </div>
          )}

          {/* Appearance Settings */}
          <div className="settings-section">
            <h2>Appearance</h2>
            <div className="setting-row">
              <div className="setting-label">
                <span className="setting-name">Theme</span>
                <span className="setting-desc">Switch between dark and light mode</span>
              </div>
              <button className="toggle-btn" onClick={toggleTheme}>
                {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>

          {/* Developer Settings */}
          <div className="settings-section">
            <h2>Developer</h2>
            <div className="setting-row">
              <div className="setting-label">
                <span className="setting-name">Debug Mode</span>
                <span className="setting-desc">Log kernel inference events</span>
              </div>
              <button
                className={`toggle-btn ${debugMode ? 'active' : ''}`}
                onClick={toggleDebugMode}
                disabled={debugLoading}
              >
                {debugLoading ? '...' : debugMode ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Services */}
          <div className="settings-section">
            <div className="section-header">
              <h2>Services</h2>
              <button className="refresh-btn-inline" onClick={refreshServices} disabled={loading}>
                ↻
              </button>
            </div>
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <div className="service-list">
                {services.map((svc) => (
                  <div key={svc.name} className="service-card">
                    <div className="service-header">
                      <div className="service-status">
                        <span
                          className="status-dot"
                          style={{ backgroundColor: getStatusColor(svc) }}
                        />
                        <span className="service-name">{svc.name}</span>
                        <span className="service-port">:{svc.port}</span>
                      </div>
                      <span className="status-text">{getStatusText(svc)}</span>
                    </div>

                    <div className="service-actions">
                      {!svc.launchd ? (
                        <button
                          className="action-btn enable"
                          onClick={() => handleEnable(svc.name)}
                          disabled={actionInProgress === svc.name}
                        >
                          Enable Auto-Start
                        </button>
                      ) : !svc.running ? (
                        <button
                          className="action-btn start"
                          onClick={() => handleStart(svc.name)}
                          disabled={actionInProgress === svc.name}
                        >
                          {actionInProgress === svc.name ? 'Starting...' : 'Start'}
                        </button>
                      ) : (
                        <button
                          className="action-btn restart"
                          onClick={() => handleRestart(svc.name)}
                          disabled={actionInProgress === svc.name}
                        >
                          {actionInProgress === svc.name ? 'Restarting...' : 'Restart'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
