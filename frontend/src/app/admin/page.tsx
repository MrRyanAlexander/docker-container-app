'use client';

import { useUser } from '@auth0/nextjs-auth0';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Container {
  id: string;
  name: string;
  status: string;
  userId: string;
  port?: number;
  uptime?: string;
  createdAt: string;
  user?: {
    email: string;
    name?: string;
  };
}

interface AuditLog {
  id: string;
  action: string;
  containerId: string;
  userId: string;
  adminUserId?: string;
  details: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [containers, setContainers] = useState<Container[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupReason, setCleanupReason] = useState('');
  const [activeTab, setActiveTab] = useState<'containers' | 'logs'>('containers');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/api/auth/login');
      return;
    }

    if (user && !user.email?.includes('admin')) {
      setError('Access denied: Admin privileges required');
      return;
    }

    if (user) {
      fetchContainers();
      fetchAuditLogs();
    }
  }, [user, isLoading, router]);

  const fetchContainers = async () => {
    try {
      const response = await fetch('/api/admin/containers');
      if (!response.ok) {
        throw new Error('Failed to fetch containers');
      }
      const data = await response.json();
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch containers');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch('/api/admin/audit-logs?limit=50');
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      const data = await response.json();
      setAuditLogs(data);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
  };

  const handleForceCleanup = async (status?: string[], userId?: string) => {
    if (!cleanupReason.trim()) {
      alert('Please provide a reason for the cleanup');
      return;
    }

    try {
      const response = await fetch('/api/admin/containers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'force_cleanup',
          status,
          userId,
          reason: cleanupReason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to perform cleanup');
      }

      const result = await response.json();
      alert(`Cleanup completed. Cleaned: ${result.cleaned} containers. Errors: ${result.errors.length}`);
      
      setCleanupReason('');
      fetchContainers();
      fetchAuditLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to perform cleanup');
    }
  };

  const handleDeleteContainer = async (containerId: string) => {
    const reason = prompt('Provide reason for deletion:');
    if (!reason?.trim()) return;

    try {
      const response = await fetch('/api/admin/containers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          containerId,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete container');
      }

      alert('Container deleted successfully');
      fetchContainers();
      fetchAuditLogs();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete container');
    }
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600 text-lg">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage containers and view audit logs</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('containers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'containers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Containers ({containers.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Audit Logs ({auditLogs.length})
            </button>
          </nav>
        </div>

        {activeTab === 'containers' ? (
          <div>
            {/* Force Cleanup Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Force Cleanup</h2>
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  placeholder="Reason for cleanup (required)"
                  value={cleanupReason}
                  onChange={(e) => setCleanupReason(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleForceCleanup(['RUNNING'])}
                    disabled={!cleanupReason.trim()}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Stop Running
                  </button>
                  <button
                    onClick={() => handleForceCleanup(['ERROR'])}
                    disabled={!cleanupReason.trim()}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clean Errors
                  </button>
                  <button
                    onClick={() => handleForceCleanup()}
                    disabled={!cleanupReason.trim()}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clean All
                  </button>
                </div>
              </div>
            </div>

            {/* Containers Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">All Containers</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Container
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Port
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uptime
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {containers.map((container) => (
                      <tr key={container.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{container.name}</div>
                            <div className="text-sm text-gray-500">{container.id}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm text-gray-900">{container.user?.email}</div>
                            <div className="text-sm text-gray-500">{container.user?.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            container.status === 'RUNNING' ? 'bg-green-100 text-green-800' :
                            container.status === 'ERROR' ? 'bg-red-100 text-red-800' :
                            container.status === 'STOPPED' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {container.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {container.port || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {container.uptime || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleDeleteContainer(container.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Audit Logs</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Container
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          log.action === 'CREATE' ? 'bg-blue-100 text-blue-800' :
                          log.action === 'START' ? 'bg-green-100 text-green-800' :
                          log.action === 'STOP' ? 'bg-yellow-100 text-yellow-800' :
                          log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                          log.action === 'FORCE_CLEANUP' ? 'bg-purple-100 text-purple-800' :
                          log.action === 'ERROR' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.containerId}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 