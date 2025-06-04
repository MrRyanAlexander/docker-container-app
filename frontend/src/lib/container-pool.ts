import Docker from 'dockerode';
import { prisma } from './db';
import { logInfo, logError, logWarn } from './logger';
import { circuitBreakers } from './circuit-breaker';

interface PooledContainer {
  id: string;
  dockerId: string;
  image: string;
  createdAt: Date;
  lastUsed?: Date;
  reserved: boolean;
  port?: number;
}

interface PoolConfig {
  poolSize: number;
  maxIdleTime: number; // seconds
  preWarmImages: string[];
  maxContainersPerImage: number;
}

class ContainerPool {
  private docker: Docker;
  private pool: Map<string, PooledContainer[]> = new Map();
  private config: PoolConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: PoolConfig) {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });
    this.config = config;
    
    logInfo('Container pool initialized', {
      poolSize: config.poolSize,
      maxIdleTime: config.maxIdleTime,
      preWarmImages: config.preWarmImages
    });

    // Initialize pools for each image
    config.preWarmImages.forEach(image => {
      this.pool.set(image, []);
    });

    // Start cleanup interval
    this.startCleanupInterval();
    
    // Pre-warm containers
    this.preWarmContainers();
  }

  /**
   * Get a container from the pool or create a new one
   */
  async getContainer(image: string = 'node:18-alpine'): Promise<PooledContainer | null> {
    try {
      return await circuitBreakers.docker.execute(
        async () => {
          const imagePool = this.pool.get(image) || [];
          
          // Find an available container
          const availableContainer = imagePool.find(container => !container.reserved);
          
          if (availableContainer) {
            // Reserve the container
            availableContainer.reserved = true;
            availableContainer.lastUsed = new Date();
            
            logInfo('Container retrieved from pool', {
              containerId: availableContainer.id,
              image,
              poolSize: imagePool.length
            });
            
            return availableContainer;
          }

          // No available containers, create a new one if pool isn't full
          if (imagePool.length < this.config.maxContainersPerImage) {
            const newContainer = await this.createPooledContainer(image);
            if (newContainer) {
              newContainer.reserved = true;
              imagePool.push(newContainer);
              this.pool.set(image, imagePool);
              
              logInfo('New pooled container created', {
                containerId: newContainer.id,
                image,
                poolSize: imagePool.length
              });
              
              return newContainer;
            }
          }

          logWarn('No containers available in pool', {
            image,
            poolSize: imagePool.length,
            maxContainersPerImage: this.config.maxContainersPerImage
          });
          
          return null;
        },
        async () => {
          logError('Container pool circuit breaker activated', new Error('Docker service unavailable'));
          return null;
        }
      );
    } catch (error) {
      logError('Error getting container from pool', error, { image });
      return null;
    }
  }

  /**
   * Return a container to the pool
   */
  async returnContainer(containerId: string): Promise<void> {
    try {
      // Find the container in any pool
      for (const [image, imagePool] of this.pool.entries()) {
        const container = imagePool.find(c => c.id === containerId);
        if (container) {
          container.reserved = false;
          container.lastUsed = new Date();
          
          // Clean up the container for reuse
          await this.resetContainer(container);
          
          logInfo('Container returned to pool', {
            containerId,
            image,
            poolSize: imagePool.length
          });
          return;
        }
      }
      
      logWarn('Container not found in pool for return', { containerId });
    } catch (error) {
      logError('Error returning container to pool', error, { containerId });
    }
  }

  /**
   * Remove a container from the pool permanently
   */
  async removeContainer(containerId: string): Promise<void> {
    try {
      for (const [image, imagePool] of this.pool.entries()) {
        const containerIndex = imagePool.findIndex(c => c.id === containerId);
        if (containerIndex !== -1) {
          const container = imagePool[containerIndex];
          
          // Remove from Docker
          try {
            const dockerContainer = this.docker.getContainer(container.dockerId);
            await dockerContainer.stop();
            await dockerContainer.remove();
          } catch (dockerError) {
            logWarn('Failed to remove Docker container', {
              containerId,
              dockerId: container.dockerId,
              error: String(dockerError)
            });
          }
          
          // Remove from pool
          imagePool.splice(containerIndex, 1);
          this.pool.set(image, imagePool);
          
          logInfo('Container removed from pool', {
            containerId,
            image,
            poolSize: imagePool.length
          });
          return;
        }
      }
      
      logWarn('Container not found in pool for removal', { containerId });
    } catch (error) {
      logError('Error removing container from pool', error, { containerId });
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    const stats: any = {
      totalContainers: 0,
      availableContainers: 0,
      reservedContainers: 0,
      images: {}
    };

    for (const [image, imagePool] of this.pool.entries()) {
      const available = imagePool.filter(c => !c.reserved).length;
      const reserved = imagePool.filter(c => c.reserved).length;
      
      stats.images[image] = {
        total: imagePool.length,
        available,
        reserved
      };
      
      stats.totalContainers += imagePool.length;
      stats.availableContainers += available;
      stats.reservedContainers += reserved;
    }

    return stats;
  }

  /**
   * Pre-warm containers for faster startup
   */
  private async preWarmContainers(): Promise<void> {
    logInfo('Pre-warming container pool');
    
    for (const image of this.config.preWarmImages) {
      const targetCount = Math.ceil(this.config.poolSize / this.config.preWarmImages.length);
      const currentPool = this.pool.get(image) || [];
      
      for (let i = currentPool.length; i < targetCount; i++) {
        try {
          const container = await this.createPooledContainer(image);
          if (container) {
            currentPool.push(container);
            this.pool.set(image, currentPool);
            
            // Small delay to avoid overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logError('Failed to pre-warm container', error, { image, attempt: i + 1 });
          break; // Stop trying for this image if we hit errors
        }
      }
    }
    
    logInfo('Container pool pre-warming completed', this.getPoolStats());
  }

  /**
   * Create a new pooled container
   */
  private async createPooledContainer(image: string): Promise<PooledContainer | null> {
    try {
      const containerId = `pool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const port = await this.getAvailablePort();
      
      const dockerContainer = await this.docker.createContainer({
        Image: image,
        name: `pooled-${containerId}`,
        Env: [
          'POOLED_CONTAINER=true',
          `CONTAINER_ID=${containerId}`,
          'NODE_ENV=production'
        ],
        HostConfig: {
          Memory: 256 * 1024 * 1024, // 256MB
          CpuQuota: 50000, // 0.5 CPU
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
        Cmd: ['sleep', 'infinity'] // Keep container running but idle
      });

      await dockerContainer.start();
      
      const pooledContainer: PooledContainer = {
        id: containerId,
        dockerId: dockerContainer.id,
        image,
        createdAt: new Date(),
        reserved: false,
        port
      };

      logInfo('Pooled container created', {
        containerId,
        dockerId: dockerContainer.id,
        image,
        port
      });

      return pooledContainer;
    } catch (error) {
      logError('Failed to create pooled container', error, { image });
      return null;
    }
  }

  /**
   * Reset container for reuse
   */
  private async resetContainer(container: PooledContainer): Promise<void> {
    try {
      const dockerContainer = this.docker.getContainer(container.dockerId);
      
      // Execute cleanup commands
      const exec = await dockerContainer.exec({
        Cmd: ['sh', '-c', 'rm -rf /tmp/* /var/tmp/* ~/.bash_history 2>/dev/null || true'],
        AttachStdout: false,
        AttachStderr: false
      });
      
      await exec.start({});
      
      logInfo('Container reset for reuse', {
        containerId: container.id,
        dockerId: container.dockerId
      });
    } catch (error) {
      logWarn('Failed to reset container, will remove it', {
        containerId: container.id,
        error: String(error)
      });
      
      // If reset fails, remove the container
      await this.removeContainer(container.id);
    }
  }

  /**
   * Cleanup idle containers
   */
  private async cleanupIdleContainers(): Promise<void> {
    const cutoffTime = new Date(Date.now() - this.config.maxIdleTime * 1000);
    let totalRemoved = 0;

    for (const [image, imagePool] of this.pool.entries()) {
      const idleContainers = imagePool.filter(
        container => !container.reserved && 
                    container.lastUsed && 
                    container.lastUsed < cutoffTime
      );

      for (const container of idleContainers) {
        await this.removeContainer(container.id);
        totalRemoved++;
      }
    }

    if (totalRemoved > 0) {
      logInfo('Cleaned up idle containers', {
        removed: totalRemoved,
        maxIdleTime: this.config.maxIdleTime,
        poolStats: this.getPoolStats()
      });
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleContainers(),
      this.config.maxIdleTime * 1000 / 2 // Check twice as often as max idle time
    );
  }

  /**
   * Stop the pool and cleanup all containers
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    logInfo('Shutting down container pool');

    for (const [image, imagePool] of this.pool.entries()) {
      for (const container of imagePool) {
        await this.removeContainer(container.id);
      }
    }

    this.pool.clear();
    logInfo('Container pool shutdown complete');
  }

  /**
   * Get available port for container
   */
  private async getAvailablePort(): Promise<number> {
    // Simple port allocation - in production, use a more sophisticated approach
    const usedPorts = new Set<number>();
    
    // Collect used ports from all pools
    for (const imagePool of this.pool.values()) {
      for (const container of imagePool) {
        if (container.port) {
          usedPorts.add(container.port);
        }
      }
    }
    
    // Find available port
    for (let port = 9000; port < 10000; port++) {
      if (!usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error('No available ports in pool range');
  }
}

// Create singleton instance
const poolConfig: PoolConfig = {
  poolSize: parseInt(process.env.CONTAINER_POOL_SIZE || '5'),
  maxIdleTime: parseInt(process.env.CONTAINER_POOL_MAX_IDLE_TIME || '300'),
  preWarmImages: (process.env.CONTAINER_POOL_PREWARM_IMAGES || 'node:18-alpine,python:3.11-alpine').split(','),
  maxContainersPerImage: parseInt(process.env.CONTAINER_POOL_MAX_PER_IMAGE || '3')
};

export const containerPool = new ContainerPool(poolConfig);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await containerPool.shutdown();
});

process.on('SIGINT', async () => {
  await containerPool.shutdown();
}); 