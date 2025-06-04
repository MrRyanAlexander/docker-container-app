'use client';

import { useUser } from '@auth0/nextjs-auth0';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ContainerStatus {
  id?: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  uptime?: string;
  resources?: {
    cpu: string;
    memory: string;
  };
}

export default function Dashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>({ status: 'stopped' });
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const handleStartContainer = async () => {
    setIsManaging(true);
    setContainerStatus({ status: 'starting' });
    
    try {
      // TODO: Implement actual container management API call
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
      setContainerStatus({
        status: 'running',
        id: 'container-' + Math.random().toString(36).substr(2, 9),
        uptime: '0m',
        resources: {
          cpu: '0.1',
          memory: '128Mi'
        }
      });
    } catch (error) {
      setContainerStatus({ status: 'error' });
    } finally {
      setIsManaging(false);
    }
  };

  const handleStopContainer = async () => {
    setIsManaging(true);
    
    try {
      // TODO: Implement actual container management API call
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setContainerStatus({ status: 'stopped' });
    } catch (error) {
      setContainerStatus({ status: 'error' });
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
      case 'running': return 'text-green-600 bg-green-100';
      case 'starting': return 'text-yellow-600 bg-yellow-100';
      case 'stopped': return 'text-gray-600 bg-gray-100';
      case 'error': return 'text-red-600 bg-red-100';
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
                    {containerStatus.status.charAt(0).toUpperCase() + containerStatus.status.slice(1)}
                  </div>
                  {containerStatus.id && (
                    <span className="text-sm text-gray-500">ID: {containerStatus.id}</span>
                  )}
                </div>
                
                <div className="space-x-2">
                  {containerStatus.status === 'stopped' && (
                    <button
                      onClick={handleStartContainer}
                      disabled={isManaging}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isManaging ? 'Starting...' : 'Start Container'}
                    </button>
                  )}
                  {containerStatus.status === 'running' && (
                    <button
                      onClick={handleStopContainer}
                      disabled={isManaging}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isManaging ? 'Stopping...' : 'Stop Container'}
                    </button>
                  )}
                </div>
              </div>

              {containerStatus.status === 'running' && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-900 mb-2">Resource Usage</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">CPU:</span>
                        <span className="font-mono">{containerStatus.resources?.cpu}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Memory:</span>
                        <span className="font-mono">{containerStatus.resources?.memory}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Uptime:</span>
                        <span className="font-mono">{containerStatus.uptime}</span>
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

              {containerStatus.status === 'stopped' && (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">📦</div>
                  <p className="text-gray-600">Your container is currently stopped.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Click "Start Container" to begin your session.
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
                  <p className="font-mono text-sm">{user.sub}</p>
                </div>
              </div>
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
                  <span className="text-gray-600">Container starts:</span>
                  <span>0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total uptime:</span>
                  <span>0h 0m</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 