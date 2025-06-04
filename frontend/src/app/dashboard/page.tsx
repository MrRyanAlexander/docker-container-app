'use client';

import { useUser } from '@auth0/nextjs-auth0';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ContainerStatus {
  id?: string;
  status: 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR' | 'TERMINATED';
  uptime?: string;
  resources?: {
    cpu: string;
    memory: string;
  };
}

interface UserEnvironment {
  theme: string;
  tools: string[];
  editor: string;
  shell: string;
  preferences: {
    autoSave: boolean;
    fontSize: number;
    tabSize: number;
    lineNumbers: boolean;
    wordWrap: boolean;
  };
  environment: {
    NODE_VERSION: string;
    TIMEZONE: string;
  };
}

export default function Dashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>({ status: 'STOPPED' });
  const [isManaging, setIsManaging] = useState(false);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [userEnv, setUserEnv] = useState<UserEnvironment | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isUpdatingEnv, setIsUpdatingEnv] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user) {
      fetchContainerStatus();
      fetchUserEnvironment();
    }
  }, [user]);

  const fetchContainerStatus = async () => {
    try {
      const response = await fetch('/api/containers');
      if (response.ok) {
        const container = await response.json();
        setContainerStatus({
          id: container.id,
          status: container.status,
          uptime: container.uptime,
          resources: container.resources
        });
        setContainerId(container.id);
      }
    } catch (error) {
      console.error('Error fetching container status:', error);
    }
  };

  const fetchUserEnvironment = async () => {
    try {
      const response = await fetch('/api/user-env');
      if (response.ok) {
        const config = await response.json();
        setUserEnv(config);
      }
    } catch (error) {
      console.error('Error fetching user environment:', error);
    }
  };

  const updateUserEnvironment = async (newConfig: UserEnvironment) => {
    setIsUpdatingEnv(true);
    try {
      const response = await fetch('/api/user-env', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newConfig),
      });

      if (response.ok) {
        const result = await response.json();
        setUserEnv(result.config);
        alert('Environment settings updated successfully!');
      } else {
        throw new Error('Failed to update environment');
      }
    } catch (error) {
      console.error('Error updating user environment:', error);
      alert('Failed to update environment settings');
    } finally {
      setIsUpdatingEnv(false);
    }
  };

  const handleToolToggle = (tool: string) => {
    if (!userEnv) return;
    
    const newTools = userEnv.tools.includes(tool)
      ? userEnv.tools.filter(t => t !== tool)
      : [...userEnv.tools, tool];
    
    setUserEnv({
      ...userEnv,
      tools: newTools
    });
  };

  const availableTools = [
    'nodejs', 'python', 'git', 'curl', 'wget', 'vim', 'nano', 'htop', 
    'docker', 'kubectl', 'helm', 'nginx', 'redis-cli', 'postgresql-client'
  ];

  const handleStartContainer = async () => {
    if (!containerId) return;
    
    setIsManaging(true);
    setContainerStatus(prev => ({ ...prev, status: 'STARTING' }));
    
    try {
      const response = await fetch('/api/containers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'start',
          containerId: containerId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setContainerStatus({
          id: result.id,
          status: result.status,
          uptime: result.uptime,
          resources: result.resources || {
            cpu: '0.1',
            memory: '128Mi'
          }
        });
      } else {
        setContainerStatus(prev => ({ ...prev, status: 'ERROR' }));
      }
    } catch (error) {
      console.error('Error starting container:', error);
      setContainerStatus(prev => ({ ...prev, status: 'ERROR' }));
    } finally {
      setIsManaging(false);
    }
  };

  const handleStopContainer = async () => {
    if (!containerId) return;
    
    setIsManaging(true);
    setContainerStatus(prev => ({ ...prev, status: 'STOPPING' }));
    
    try {
      const response = await fetch('/api/containers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'stop',
          containerId: containerId
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setContainerStatus({
          id: result.id,
          status: result.status,
          uptime: result.uptime,
          resources: result.resources
        });
      } else {
        setContainerStatus(prev => ({ ...prev, status: 'ERROR' }));
      }
    } catch (error) {
      console.error('Error stopping container:', error);
      setContainerStatus(prev => ({ ...prev, status: 'ERROR' }));
    } finally {
      setIsManaging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'text-green-600 bg-green-100';
      case 'STARTING': return 'text-yellow-600 bg-yellow-100';
      case 'STOPPING': return 'text-orange-600 bg-orange-100';
      case 'STOPPED': return 'text-gray-600 bg-gray-100';
      case 'ERROR': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              ContainerApp
            </Link>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <img
                  src={user.picture || '/default-avatar.png'}
                  alt={user.name || 'User'}
                  className="w-8 h-8 rounded-full"
                />
                <span className="text-gray-700">{user.name}</span>
              </div>
              <a
                href="/auth/logout"
                className="text-gray-600 hover:text-red-600 transition-colors"
              >
                Logout
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Manage your personal container environment</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Container Status */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-xl font-semibold mb-4">Container Status</h2>
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(containerStatus.status)}`}>
                    {containerStatus.status.charAt(0).toUpperCase() + containerStatus.status.slice(1).toLowerCase()}
                  </div>
                  {containerStatus.id && (
                    <span className="text-sm text-gray-500">ID: {containerStatus.id.slice(0, 8)}...</span>
                  )}
                </div>
                
                <div className="space-x-2">
                  {containerStatus.status === 'STOPPED' && (
                    <button
                      onClick={handleStartContainer}
                      disabled={isManaging}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isManaging ? 'Starting...' : 'Start Container'}
                    </button>
                  )}
                  {containerStatus.status === 'RUNNING' && (
                    <button
                      onClick={handleStopContainer}
                      disabled={isManaging}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isManaging ? 'Stopping...' : 'Stop Container'}
                    </button>
                  )}
                  {(containerStatus.status === 'STARTING' || containerStatus.status === 'STOPPING') && (
                    <button
                      disabled
                      className="bg-gray-400 text-white px-4 py-2 rounded-lg cursor-not-allowed"
                    >
                      {containerStatus.status === 'STARTING' ? 'Starting...' : 'Stopping...'}
                    </button>
                  )}
                </div>
              </div>

              {containerStatus.status === 'RUNNING' && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Resource Usage</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">CPU:</span>
                        <span className="font-mono">{containerStatus.resources?.cpu || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Memory:</span>
                        <span className="font-mono">{containerStatus.resources?.memory || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Uptime:</span>
                        <span className="font-mono">{containerStatus.uptime || '0m'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Quick Actions</h3>
                    <div className="space-y-2">
                      <button className="w-full text-left text-blue-600 hover:text-blue-800 transition-colors">
                        Open Terminal
                      </button>
                      <button className="w-full text-left text-blue-600 hover:text-blue-800 transition-colors">
                        View Logs
                      </button>
                      <button className="w-full text-left text-blue-600 hover:text-blue-800 transition-colors">
                        File Manager
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {containerStatus.status === 'STOPPED' && (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">📦</div>
                  <p className="text-gray-600">Your container is currently stopped.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Click "Start Container" to begin your session.
                  </p>
                </div>
              )}

              {containerStatus.status === 'ERROR' && (
                <div className="text-center py-8">
                  <div className="text-red-400 text-4xl mb-4">⚠️</div>
                  <p className="text-red-600">There was an error with your container.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Please try starting it again or contact support if the issue persists.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Info */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-4">Account Info</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Email</label>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">User ID</label>
                  <p className="font-mono text-sm">{user.sub?.slice(0, 20)}...</p>
                </div>
              </div>
            </div>

            {/* Environment Settings Button */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="w-full flex items-center justify-between text-left font-semibold text-gray-900 hover:text-blue-600 transition-colors"
              >
                <span>⚙️ Environment Settings</span>
                <span className={`transform transition-transform ${showSettings ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              
              {showSettings && userEnv && (
                <div className="mt-4 space-y-4">
                  {/* Tools Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Available Tools
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {availableTools.map((tool) => (
                        <label
                          key={tool}
                          className="flex items-center space-x-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={userEnv.tools.includes(tool)}
                            onChange={() => handleToolToggle(tool)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="capitalize">{tool}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Editor Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Editor
                    </label>
                    <select
                      value={userEnv.editor}
                      onChange={(e) => setUserEnv({ ...userEnv, editor: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="vim">Vim</option>
                      <option value="nano">Nano</option>
                      <option value="emacs">Emacs</option>
                      <option value="code">VS Code</option>
                    </select>
                  </div>

                  {/* Shell Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Default Shell
                    </label>
                    <select
                      value={userEnv.shell}
                      onChange={(e) => setUserEnv({ ...userEnv, shell: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="bash">Bash</option>
                      <option value="zsh">Zsh</option>
                      <option value="fish">Fish</option>
                      <option value="sh">Sh</option>
                    </select>
                  </div>

                  {/* Theme Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Theme
                    </label>
                    <select
                      value={userEnv.theme}
                      onChange={(e) => setUserEnv({ ...userEnv, theme: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={() => updateUserEnvironment(userEnv)}
                    disabled={isUpdatingEnv}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUpdatingEnv ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              )}
            </div>

            {/* Resource Limits */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-4">Resource Limits</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Max CPU:</span>
                  <span className="font-mono">0.5 cores</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Memory:</span>
                  <span className="font-mono">512Mi</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Storage:</span>
                  <span className="font-mono">1Gi</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="font-semibold mb-4">Recent Activity</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Last login:</span>
                  <span>Just now</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Container status:</span>
                  <span className="capitalize">{containerStatus.status.toLowerCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Uptime:</span>
                  <span>{containerStatus.uptime || '0m'}</span>
                </div>
                {userEnv && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tools enabled:</span>
                    <span>{userEnv.tools.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 