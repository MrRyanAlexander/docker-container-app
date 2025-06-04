import { NextResponse } from 'next/server';
import { circuitBreakers, getAllCircuitBreakerStats } from '@/lib/circuit-breaker';
import { prisma } from '@/lib/db';
import { logInfo, logError } from '@/lib/logger';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'healthy' | 'degraded' | 'unhealthy';
  containers: 'healthy' | 'degraded' | 'unhealthy';
  auth: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  estimatedRestoreTime?: string;
  message?: string;
  details: {
    circuitBreakers: any[];
    errors: string[];
  };
}

export async function GET() {
  const startTime = Date.now();
  const errors: string[] = [];
  let database: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let containers: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let auth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  logInfo('Health check initiated');

  // Test Database
  try {
    await circuitBreakers.database.execute(
      async () => {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      },
      async () => {
        database = 'unhealthy';
        errors.push('Database connection failed');
        return false;
      }
    );
  } catch (error) {
    database = 'unhealthy';
    errors.push(`Database error: ${String(error)}`);
    logError('Database health check failed', error);
  }

  // Test Docker/Container Service
  try {
    await circuitBreakers.docker.execute(
      async () => {
        // Test Docker connection by listing containers
        const Docker = require('dockerode');
        const docker = new Docker({
          socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
        });
        await docker.listContainers();
        return true;
      },
      async () => {
        containers = 'degraded'; // Docker down but app can still function
        errors.push('Container service unavailable');
        return false;
      }
    );
  } catch (error) {
    containers = 'degraded';
    errors.push(`Container service error: ${String(error)}`);
    logError('Container service health check failed', error);
  }

  // Test Auth0 (simplified - just check if we can reach Auth0)
  try {
    await circuitBreakers.auth0.execute(
      async () => {
        // Simple connectivity test to Auth0
        if (process.env.AUTH0_ISSUER_BASE_URL) {
          const response = await fetch(`${process.env.AUTH0_ISSUER_BASE_URL}/.well-known/jwks.json`, {
            method: 'GET'
          });
          if (!response.ok) {
            throw new Error(`Auth0 returned ${response.status}`);
          }
        }
        return true;
      },
      async () => {
        auth = 'degraded'; // Auth issues but existing sessions might work
        errors.push('Authentication service degraded');
        return false;
      }
    );
  } catch (error) {
    auth = 'degraded';
    errors.push(`Authentication service error: ${String(error)}`);
    logError('Auth service health check failed', error);
  }

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  let message: string | undefined;
  let estimatedRestoreTime: string | undefined;

  if (database === 'unhealthy') {
    status = 'unhealthy';
    message = 'Database is currently unavailable. Core functionality is disabled.';
    estimatedRestoreTime = 'We are working to restore service as quickly as possible.';
  } else if (containers === 'degraded' || auth === 'degraded') {
    status = 'degraded';
    message = 'All core services are operational with some degraded performance.';
  }

  const duration = Date.now() - startTime;
  const result: HealthCheckResult = {
    status,
    database,
    containers,
    auth,
    timestamp: new Date().toISOString(),
    message,
    estimatedRestoreTime,
    details: {
      circuitBreakers: getAllCircuitBreakerStats(),
      errors
    }
  };

  logInfo('Health check completed', {
    status,
    duration,
    errorCount: errors.length
  });

  // Return appropriate HTTP status
  const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 206 : 503;

  return NextResponse.json(result, { status: httpStatus });
}

// Also support HEAD requests for simple connectivity checks
export async function HEAD() {
  try {
    // Quick database ping
    await prisma.$queryRaw`SELECT 1`;
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    logError('HEAD health check failed', error);
    return new NextResponse(null, { status: 503 });
  }
} 