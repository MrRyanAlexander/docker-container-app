import Docker from 'dockerode';
import { prisma } from './db';
import { logInfo, logError, logContainerOperation, logAudit } from './logger';

type ContainerStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR' | 'TERMINATED';
type AuditAction = 'CREATE' | 'START' | 'STOP' | 'CLEANUP_IDLE' | 'FORCE_CLEANUP' | 'DELETE' | 'ERROR';

export interface ContainerConfig {
  userId: string;
  name: string;
  image?: string;
  cpuLimit?: number;
  memoryLimit?: number;
  storageLimit?: number;
}

export interface ContainerInfo {
  id: string;
  dockerId?: string;
  name: string;
  status: ContainerStatus;
  port?: number;
  uptime?: string;
  resources?: {
    cpu: string;
    memory: string;
  };
  createdAt: Date;
  lastActivity?: Date;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  containerId: string;
  userId: string;
  adminUserId?: string;
  details: string;
  timestamp: Date;
}

class ContainerManager {
  private docker: Docker;

  constructor() {
    // Initialize Docker client
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
    
    logInfo('Container manager initialized', {
      dockerSocket: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
  }

  /**
   * Log audit action for container operations
   */
  private async logAuditAction(
    action: AuditAction,
    containerId: string,
    userId: string,
    details: string,
    adminUserId?: string
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          containerId,
          userId,
          adminUserId,
          details,
          timestamp: new Date()
        }
      });
      
      logAudit(action, containerId, userId, adminUserId, { details });
    } catch (error) {
      logError('Failed to log audit action', error, {
        action,
        containerId,
        userId,
        adminUserId,
        details
      });
      // Don't throw - logging failures shouldn't break main functionality
    }
  }

  /**
   * Get audit logs for a container or user
   */
  async getAuditLogs(options: {
    containerId?: string;
    userId?: string;
    action?: AuditAction;
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      logInfo('Fetching audit logs', options);
      
      const where: any = {};
      if (options.containerId) where.containerId = options.containerId;
      if (options.userId) where.userId = options.userId;
      if (options.action) where.action = options.action;

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit || 100
      });

      logInfo('Audit logs fetched successfully', {
        count: logs.length,
        options
      });

      return logs;
    } catch (error) {
      logError('Error getting audit logs', error, options);
      return [];
    }
  }

  /**
   * Get or create a user's default container
   */
  async getUserContainer(userId: string): Promise<ContainerInfo | null> {
    try {
      logInfo('Getting user container', { userId });
      
      // First, try to find existing container
      const container = await prisma.container.findFirst({
        where: {
          userId,
          name: 'default'
        }
      });

      if (container) {
        logInfo('Found existing container for user', {
          userId,
          containerId: container.id,
          status: container.status
        });
        return this.mapContainerToInfo(container);
      }

      logInfo('No container found for user', { userId });
      return null;
    } catch (error) {
      logError('Error getting user container', error, { userId });
      throw new Error('Failed to get container information');
    }
  }

  /**
   * Create a new container for a user
   */
  async createContainer(config: ContainerConfig): Promise<ContainerInfo> {
    try {
      logInfo('Creating new container', config);
      
      // Check if user already has a container with this name
      const existing = await prisma.container.findUnique({
        where: {
          userId_name: {
            userId: config.userId,
            name: config.name
          }
        }
      });

      if (existing) {
        const error = new Error('Container with this name already exists');
        logError('Container creation failed - duplicate name', error, config);
        throw error;
      }

      // Create container record in database
      const container = await prisma.container.create({
        data: {
          userId: config.userId,
          name: config.name,
          image: config.image || 'node:18-alpine',
          status: 'STOPPED',
          cpuLimit: config.cpuLimit || 0.5,
          memoryLimit: config.memoryLimit || 512,
          storageLimit: config.storageLimit || 1024
        }
      });

      await this.logAuditAction('CREATE', container.id, config.userId, `Created container ${config.name}`);
      
      logContainerOperation('CREATE', container.id, config.userId, true, {
        name: config.name,
        image: config.image || 'node:18-alpine'
      });

      return this.mapContainerToInfo(container);
    } catch (error) {
      logError('Error creating container', error, config);
      logContainerOperation('CREATE', '', config.userId, false, { error: String(error) });
      
      // Re-throw specific error messages, otherwise use generic message
      if (error instanceof Error && error.message === 'Container with this name already exists') {
        throw error;
      }
      
      throw new Error('Failed to create container');
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<ContainerInfo> {
    const startTime = Date.now();
    
    try {
      logInfo('Starting container', { containerId });
      
      // Get container from database
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container) {
        const error = new Error('Container not found');
        logError('Container start failed - not found', error, { containerId });
        throw error;
      }

      // Update status to starting
      await prisma.container.update({
        where: { id: containerId },
        data: {
          status: 'STARTING',
          lastActivity: new Date()
        }
      });

      logContainerOperation('START_INITIATED', container.id, container.userId, true);

      try {
        // Generate unique port for this container
        const port = await this.getAvailablePort();
        
        logInfo('Allocated port for container', {
          containerId,
          port
        });
        
        // Create Docker container if it doesn't exist
        let dockerContainer;
        if (container.dockerId) {
          try {
            dockerContainer = this.docker.getContainer(container.dockerId);
            await dockerContainer.inspect();
            logInfo('Found existing Docker container', {
              containerId,
              dockerId: container.dockerId
            });
          } catch {
            logInfo('Docker container not found, creating new one', {
              containerId,
              oldDockerId: container.dockerId
            });
            dockerContainer = await this.createDockerContainer(container, port);
          }
        } else {
          logInfo('Creating new Docker container', { containerId });
          dockerContainer = await this.createDockerContainer(container, port);
        }

        // Start the container
        await dockerContainer.start();
        
        const duration = Date.now() - startTime;
        
        logInfo('Docker container started successfully', {
          containerId,
          dockerId: dockerContainer.id,
          port,
          duration
        });

        // Update database with running status
        const updatedContainer = await prisma.container.update({
          where: { id: containerId },
          data: {
            status: 'RUNNING',
            dockerId: dockerContainer.id,
            port,
            startedAt: new Date(),
            lastActivity: new Date()
          }
        });

        await this.logAuditAction('START', updatedContainer.id, updatedContainer.userId, `Started container ${updatedContainer.name}`);
        
        logContainerOperation('START', updatedContainer.id, updatedContainer.userId, true, {
          port,
          duration,
          dockerId: dockerContainer.id
        });

        return this.mapContainerToInfo(updatedContainer);
      } catch (dockerError) {
        const duration = Date.now() - startTime;
        
        logError('Docker container start failed', dockerError, {
          containerId,
          duration
        });
        
        // Update status to error if Docker operations fail
        await prisma.container.update({
          where: { id: containerId },
          data: {
            status: 'ERROR',
            lastActivity: new Date()
          }
        });
        
        await this.logAuditAction('ERROR', container.id, container.userId, `Failed to start container ${container.name}: ${String(dockerError)}`);
        logContainerOperation('START', container.id, container.userId, false, {
          error: String(dockerError),
          duration
        });
        throw dockerError;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Error starting container', error, { containerId, duration });
      throw new Error('Failed to start container');
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<ContainerInfo> {
    const startTime = Date.now();
    
    try {
      logInfo('Stopping container', { containerId });
      
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container) {
        const error = new Error('Container not found');
        logError('Container stop failed - not found', error, { containerId });
        throw error;
      }

      // Update status to stopping
      await prisma.container.update({
        where: { id: containerId },
        data: {
          status: 'STOPPING',
          lastActivity: new Date()
        }
      });

      logContainerOperation('STOP_INITIATED', container.id, container.userId, true);

      try {
        // Stop Docker container if it exists
        if (container.dockerId) {
          logInfo('Stopping Docker container', {
            containerId,
            dockerId: container.dockerId
          });
          
          const dockerContainer = this.docker.getContainer(container.dockerId);
          await dockerContainer.stop();
          await dockerContainer.remove();
          
          logInfo('Docker container stopped and removed', {
            containerId,
            dockerId: container.dockerId
          });
        }

        const duration = Date.now() - startTime;

        // Update database with stopped status
        const updatedContainer = await prisma.container.update({
          where: { id: containerId },
          data: {
            status: 'STOPPED',
            dockerId: null,
            port: null,
            stoppedAt: new Date(),
            lastActivity: new Date()
          }
        });

        await this.logAuditAction('STOP', updatedContainer.id, updatedContainer.userId, `Stopped container ${updatedContainer.name}`);
        
        logContainerOperation('STOP', updatedContainer.id, updatedContainer.userId, true, {
          duration
        });

        return this.mapContainerToInfo(updatedContainer);
      } catch (dockerError) {
        const duration = Date.now() - startTime;
        
        logError('Docker container stop failed, marking as stopped anyway', dockerError, {
          containerId,
          duration
        });
        
        // Even if Docker operations fail, mark as stopped
        const updatedContainer = await prisma.container.update({
          where: { id: containerId },
          data: {
            status: 'STOPPED',
            dockerId: null,
            port: null,
            stoppedAt: new Date(),
            lastActivity: new Date()
          }
        });

        await this.logAuditAction('ERROR', updatedContainer.id, updatedContainer.userId, `Failed to stop container ${updatedContainer.name}: ${String(dockerError)}`);
        
        logContainerOperation('STOP', updatedContainer.id, updatedContainer.userId, false, {
          error: String(dockerError),
          duration
        });

        return this.mapContainerToInfo(updatedContainer);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Error stopping container', error, { containerId, duration });
      throw new Error('Failed to stop container');
    }
  }

  /**
   * Get container statistics
   */
  async getContainerStats(containerId: string): Promise<any> {
    try {
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container || !container.dockerId) {
        return null;
      }

      const dockerContainer = this.docker.getContainer(container.dockerId);
      const stats = await dockerContainer.stats({ stream: false });
      
      return {
        cpu: this.calculateCpuPercent(stats),
        memory: this.formatBytes(stats.memory_stats.usage || 0),
        uptime: this.calculateUptime(container.startedAt)
      };
    } catch (error) {
      console.error('Error getting container stats:', error);
      return null;
    }
  }

  /**
   * Cleanup idle containers
   */
  async cleanupIdleContainers(timeoutMinutes: number = 30): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      
      const idleContainers = await prisma.container.findMany({
        where: {
          status: 'RUNNING',
          lastActivity: {
            lt: cutoffTime
          }
        }
      });

      for (const container of idleContainers) {
        try {
          await this.stopContainer(container.id);
          await this.logAuditAction('CLEANUP_IDLE', container.id, container.userId, `Stopped idle container ${container.name} (${container.id})`);
        } catch (error) {
          console.error(`Failed to stop idle container ${container.id}:`, error);
          await this.logAuditAction('ERROR', container.id, container.userId, `Failed to stop idle container ${container.id}: ${String(error)}`);
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      await this.logAuditAction('ERROR', '', '', `Failed to cleanup idle containers: ${String(error)}`);
    }
  }

  /**
   * Force cleanup containers (admin action)
   */
  async forceCleanupContainers(options: {
    userId?: string;
    status?: ContainerStatus[];
    adminUserId: string;
    reason: string;
  }): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      const where: any = {};
      if (options.userId) where.userId = options.userId;
      if (options.status) where.status = { in: options.status };

      const containers = await prisma.container.findMany({ where });

      for (const container of containers) {
        try {
          await this.stopContainer(container.id);
          await this.logAuditAction(
            'FORCE_CLEANUP',
            container.id,
            container.userId,
            `Force cleanup by admin: ${options.reason}`,
            options.adminUserId
          );
          cleaned++;
        } catch (error) {
          const errorMsg = `Failed to force cleanup container ${container.id}: ${String(error)}`;
          errors.push(errorMsg);
          await this.logAuditAction('ERROR', container.id, container.userId, errorMsg, options.adminUserId);
        }
      }

      return { cleaned, errors };
    } catch (error) {
      const errorMsg = `Failed to force cleanup containers: ${String(error)}`;
      errors.push(errorMsg);
      await this.logAuditAction('ERROR', '', '', errorMsg, options.adminUserId);
      return { cleaned, errors };
    }
  }

  /**
   * Delete container permanently (admin action)
   */
  async deleteContainer(containerId: string, adminUserId: string, reason: string): Promise<void> {
    try {
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container) {
        throw new Error('Container not found');
      }

      // Stop container if running
      if (container.status === 'RUNNING') {
        await this.stopContainer(containerId);
      }

      // Delete from database
      await prisma.container.delete({
        where: { id: containerId }
      });

      await this.logAuditAction(
        'DELETE',
        containerId,
        container.userId,
        `Container deleted by admin: ${reason}`,
        adminUserId
      );
    } catch (error) {
      const errorMsg = `Failed to delete container ${containerId}: ${String(error)}`;
      await this.logAuditAction('ERROR', containerId, '', errorMsg, adminUserId);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get all containers (admin view)
   */
  async getAllContainers(options?: {
    status?: ContainerStatus;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ContainerInfo[]> {
    try {
      const where: any = {};
      if (options?.status) where.status = options.status;
      if (options?.userId) where.userId = options.userId;

      const containers = await prisma.container.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 100,
        skip: options?.offset || 0,
        include: {
          user: {
            select: {
              email: true,
              name: true
            }
          }
        }
      });

      return containers.map((container: any) => ({
        ...this.mapContainerToInfo(container),
        user: container.user
      }));
    } catch (error) {
      console.error('Error getting all containers:', error);
      return [];
    }
  }

  // Private helper methods

  private async createDockerContainer(container: any, port: number): Promise<any> {
    const containerName = `user-${container.userId}-${container.name}`;
    
    // Get user environment configuration
    let userEnv: any = {};
    try {
      const userEnvRecord = await prisma.userEnv.findUnique({
        where: { userId: container.userId }
      });
      if (userEnvRecord) {
        userEnv = userEnvRecord.config;
      }
    } catch (error) {
      console.warn('Could not fetch user environment config:', error);
    }
    
    // Prepare environment variables based on user preferences
    const envVars = [
      `USER_ID=${container.userId}`,
      `CONTAINER_ID=${container.id}`,
      `DEFAULT_EDITOR=${userEnv.editor || 'vim'}`,
      `DEFAULT_SHELL=${userEnv.shell || 'bash'}`,
      `THEME=${userEnv.theme || 'dark'}`,
      `NODE_VERSION=${userEnv.environment?.NODE_VERSION || '18'}`,
      `TZ=${userEnv.environment?.TIMEZONE || 'UTC'}`
    ];

    // Add tools as environment variable
    if (userEnv.tools && Array.isArray(userEnv.tools)) {
      envVars.push(`AVAILABLE_TOOLS=${userEnv.tools.join(',')}`);
    }

    // Add preferences as JSON
    if (userEnv.preferences) {
      envVars.push(`USER_PREFERENCES=${JSON.stringify(userEnv.preferences)}`);
    }
    
    return await this.docker.createContainer({
      Image: container.image,
      name: containerName,
      Env: envVars,
      HostConfig: {
        Memory: container.memoryLimit * 1024 * 1024, // Convert MB to bytes
        CpuQuota: Math.floor(container.cpuLimit * 100000), // Convert to CPU quota
        CpuPeriod: 100000,
        PortBindings: {
          '3000/tcp': [{ HostPort: port.toString() }]
        },
        RestartPolicy: {
          Name: 'unless-stopped'
        }
      },
      ExposedPorts: {
        '3000/tcp': {}
      },
      WorkingDir: '/app',
      Cmd: ['sleep', 'infinity']
    });
  }

  private async getAvailablePort(): Promise<number> {
    // Simple port allocation - in production, use a more sophisticated approach
    const usedPorts = await prisma.container.findMany({
      where: {
        port: { not: null }
      },
      select: { port: true }
    });

    const usedPortNumbers = usedPorts.map((c: { port: number | null }) => c.port).filter(Boolean) as number[];
    
    for (let port = 8000; port < 9000; port++) {
      if (!usedPortNumbers.includes(port)) {
        return port;
      }
    }

    throw new Error('No available ports');
  }

  private mapContainerToInfo(container: any): ContainerInfo {
    return {
      id: container.id,
      dockerId: container.dockerId,
      name: container.name,
      status: container.status,
      port: container.port,
      uptime: container.startedAt ? this.calculateUptime(container.startedAt) : undefined,
      createdAt: container.createdAt,
      lastActivity: container.lastActivity
    };
  }

  private calculateCpuPercent(stats: any): string {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
    return `${cpuPercent.toFixed(1)}%`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private calculateUptime(startTime: Date | null): string {
    if (!startTime) return '0m';
    
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return `${diffMins}m`;
  }
}

export const containerManager = new ContainerManager(); 