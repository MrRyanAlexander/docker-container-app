'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface MaintenanceStatus {
  database: boolean;
  containers: boolean;
  auth: boolean;
  estimatedRestoreTime?: string;
  message?: string;
}

export default function MaintenancePage() {
  const [status, setStatus] = useState<MaintenanceStatus>({
    database: false,
    containers: false,
    auth: false
  });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    checkSystemStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkSystemStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkSystemStatus = async () => {
    try {
      const response = await fetch('/api/health-check', {
        method: 'GET',
        cache: 'no-cache'
      });
      
      if (response.ok) {
        const healthStatus = await response.json();
        setStatus({
          database: healthStatus.database === 'healthy',
          containers: healthStatus.containers === 'healthy',
          auth: healthStatus.auth === 'healthy',
          estimatedRestoreTime: healthStatus.estimatedRestoreTime,
          message: healthStatus.message
        });
        
        // If all systems are healthy, redirect to home
        if (healthStatus.database === 'healthy' && 
            healthStatus.containers === 'healthy' && 
            healthStatus.auth === 'healthy') {
          window.location.href = '/';
        }
      } else {
        setRetryCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Health check failed:', error);
      setRetryCount(prev => prev + 1);
    }
  };

  const getStatusIcon = (isHealthy: boolean) => {
    return isHealthy ? '✅' : '❌';
  };

  const getStatusText = (isHealthy: boolean) => {
    return isHealthy ? 'Operational' : 'Down';
  };

  const getStatusColor = (isHealthy: boolean) => {
    return isHealthy ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Maintenance Icon */}
        <div className="text-6xl mb-6">🚧</div>
        
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          System Maintenance
        </h1>
        
        {/* Description */}
        <p className="text-gray-600 mb-6">
          We're currently experiencing technical difficulties. Our team is working hard to restore full functionality.
        </p>

        {/* Custom Message */}
        {status.message && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-blue-800 text-sm">{status.message}</p>
          </div>
        )}

        {/* System Status */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>{getStatusIcon(status.database)}</span>
                <span className="text-sm font-medium">Database</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(status.database)}`}>
                {getStatusText(status.database)}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>{getStatusIcon(status.containers)}</span>
                <span className="text-sm font-medium">Container Service</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(status.containers)}`}>
                {getStatusText(status.containers)}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>{getStatusIcon(status.auth)}</span>
                <span className="text-sm font-medium">Authentication</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(status.auth)}`}>
                {getStatusText(status.auth)}
              </span>
            </div>
          </div>
        </div>

        {/* Estimated Restore Time */}
        {status.estimatedRestoreTime && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-yellow-800 mb-1">
              Estimated Restore Time
            </h3>
            <p className="text-yellow-700 text-sm">{status.estimatedRestoreTime}</p>
          </div>
        )}

        {/* Auto-refresh indicator */}
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mb-6">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
          <span>Auto-refreshing every 30 seconds</span>
        </div>

        {/* Retry counter */}
        {retryCount > 0 && (
          <p className="text-xs text-gray-400 mb-4">
            Health check attempts: {retryCount}
          </p>
        )}

        {/* Manual Refresh */}
        <button
          onClick={checkSystemStatus}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors mb-4"
        >
          Check Status Now
        </button>

        {/* Back to Home */}
        <Link
          href="/"
          className="block w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-center"
        >
          Back to Home
        </Link>

        {/* Contact Support */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            For urgent issues, please contact our{' '}
            <a 
              href="mailto:support@container-app.com" 
              className="text-blue-600 hover:underline"
            >
              support team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 