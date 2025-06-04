import Docker from 'dockerode';
import { prisma } from './db';

type ContainerStatus = 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR' | 'TERMINATED';

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

class ContainerManager {
  private docker: Docker;

  constructor() {
    // Initialize Docker client
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
  }

  /**
   * Get or create a user's default container
   */
  async getUserContainer(userId: string): Promise<ContainerInfo | null> {
    try {
      // First, try to find existing container
      const container = await prisma.container.findFirst({
        where: {
          userId,
          name: 'default'
        }
      });

      if (container) {
        return this.mapContainerToInfo(container);
      }

      return null;
    } catch (error) {
      console.error('Error getting user container:', error);
      throw new Error('Failed to get container information');
    }
  }

  /**
   * Create a new container for a user
   */
  async createContainer(config: ContainerConfig): Promise<ContainerInfo> {
    try {
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
        throw new Error('Container with this name already exists');
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

      return this.mapContainerToInfo(container);
    } catch (error) {
      console.error('Error creating container:', error);
      throw new Error('Failed to create container');
    }
  }

  /**
   * Start a container
   */
  async startContainer(containerId: string): Promise<ContainerInfo> {
    try {
      // Get container from database
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container) {
        throw new Error('Container not found');
      }

      // Update status to starting
      await prisma.container.update({
        where: { id: containerId },
        data: {
          status: 'STARTING',
          lastActivity: new Date()
        }
      });

      try {
        // Generate unique port for this container
        const port = await this.getAvailablePort();
        
        // Create Docker container if it doesn't exist
        let dockerContainer;
        if (container.dockerId) {
          try {
            dockerContainer = this.docker.getContainer(container.dockerId);
            await dockerContainer.inspect();
          } catch {
            // Container doesn't exist in Docker, create new one
            dockerContainer = await this.createDockerContainer(container, port);
          }
        } else {
          dockerContainer = await this.createDockerContainer(container, port);
        }

        // Start the container
        await dockerContainer.start();

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

        return this.mapContainerToInfo(updatedContainer);
      } catch (dockerError) {
        // Update status to error if Docker operations fail
        await prisma.container.update({
          where: { id: containerId },
          data: {
            status: 'ERROR',
            lastActivity: new Date()
          }
        });
        throw dockerError;
      }
    } catch (error) {
      console.error('Error starting container:', error);
      throw new Error('Failed to start container');
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerId: string): Promise<ContainerInfo> {
    try {
      const container = await prisma.container.findUnique({
        where: { id: containerId }
      });

      if (!container) {
        throw new Error('Container not found');
      }

      // Update status to stopping
      await prisma.container.update({
        where: { id: containerId },
        data: {
          status: 'STOPPING',
          lastActivity: new Date()
        }
      });

      try {
        // Stop Docker container if it exists
        if (container.dockerId) {
          const dockerContainer = this.docker.getContainer(container.dockerId);
          await dockerContainer.stop();
          await dockerContainer.remove();
        }

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

        return this.mapContainerToInfo(updatedContainer);
      } catch (dockerError) {
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

        return this.mapContainerToInfo(updatedContainer);
      }
    } catch (error) {
      console.error('Error stopping container:', error);
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
          console.log(`Stopped idle container: ${container.name} (${container.id})`);
        } catch (error) {
          console.error(`Failed to stop idle container ${container.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Private helper methods

  private async createDockerContainer(container: any, port: number): Promise<any> {
    const containerName = `user-${container.userId}-${container.name}`;
    
    return await this.docker.createContainer({
      Image: container.image,
      name: containerName,
      Env: [
        `USER_ID=${container.userId}`,
        `CONTAINER_ID=${container.id}`
      ],
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