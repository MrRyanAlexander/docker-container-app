import { containerManager } from '../container-manager';
import { prisma } from '../db';
import { logInfo, logError, logContainerOperation } from '../logger';

// Mock the dependencies
jest.mock('../db');
jest.mock('../logger');
jest.mock('dockerode');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ContainerManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserContainer', () => {
    it('should return existing container for user', async () => {
      const mockContainer = {
        id: 'container-123',
        userId: 'user-123',
        name: 'default',
        status: 'RUNNING',
        dockerId: 'docker-123',
        port: 8001,
        createdAt: new Date(),
        lastActivity: new Date(),
        startedAt: new Date(Date.now() - 600000), // Started 10 minutes ago
      };

      mockPrisma.container.findFirst.mockResolvedValue(mockContainer);

      const result = await containerManager.getUserContainer('user-123');

      expect(result).toEqual({
        id: 'container-123',
        dockerId: 'docker-123',
        name: 'default',
        status: 'RUNNING',
        port: 8001,
        createdAt: mockContainer.createdAt,
        lastActivity: mockContainer.lastActivity,
        uptime: expect.any(String),
      });

      expect(mockPrisma.container.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          name: 'default'
        }
      });
    });

    it('should return null if no container exists', async () => {
      mockPrisma.container.findFirst.mockResolvedValue(null);

      const result = await containerManager.getUserContainer('user-123');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      mockPrisma.container.findFirst.mockRejectedValue(error);

      await expect(containerManager.getUserContainer('user-123')).rejects.toThrow(
        'Failed to get container information'
      );

      expect(logError).toHaveBeenCalledWith(
        'Error getting user container',
        error,
        { userId: 'user-123' }
      );
    });
  });

  describe('createContainer', () => {
    it('should create new container successfully', async () => {
      const config = {
        userId: 'user-123',
        name: 'test-container',
        image: 'node:18-alpine',
        cpuLimit: 1,
        memoryLimit: 1024,
        storageLimit: 2048
      };

      const mockCreatedContainer = {
        id: 'container-456',
        userId: 'user-123',
        name: 'test-container',
        image: 'node:18-alpine',
        status: 'STOPPED',
        cpuLimit: 1,
        memoryLimit: 1024,
        storageLimit: 2048,
        createdAt: new Date(),
      };

      mockPrisma.container.findUnique.mockResolvedValue(null); // No existing container
      mockPrisma.container.create.mockResolvedValue(mockCreatedContainer);
      mockPrisma.auditLog.create.mockResolvedValue({} as any);

      const result = await containerManager.createContainer(config);

      expect(result).toEqual({
        id: 'container-456',
        dockerId: undefined,
        name: 'test-container',
        status: 'STOPPED',
        createdAt: mockCreatedContainer.createdAt,
        lastActivity: undefined,
        uptime: undefined,
        port: undefined,
      });

      expect(mockPrisma.container.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          name: 'test-container',
          image: 'node:18-alpine',
          status: 'STOPPED',
          cpuLimit: 1,
          memoryLimit: 1024,
          storageLimit: 2048
        }
      });

      expect(logContainerOperation).toHaveBeenCalledWith(
        'CREATE',
        'container-456',
        'user-123',
        true,
        expect.any(Object)
      );
    });

    it('should reject duplicate container names', async () => {
      const config = {
        userId: 'user-123',
        name: 'existing-container'
      };

      const existingContainer = {
        id: 'existing-123',
        userId: 'user-123',
        name: 'existing-container'
      };

      mockPrisma.container.findUnique.mockResolvedValue(existingContainer as any);

      await expect(containerManager.createContainer(config)).rejects.toThrow(
        'Container with this name already exists'
      );

      expect(logContainerOperation).toHaveBeenCalledWith(
        'CREATE',
        '',
        'user-123',
        false,
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('startContainer', () => {
    it('should start container successfully', async () => {
      const mockContainer = {
        id: 'container-123',
        userId: 'user-123',
        name: 'test-container',
        image: 'node:18-alpine',
        status: 'STOPPED',
        cpuLimit: 0.5,
        memoryLimit: 512,
        dockerId: null,
      };

      const mockUpdatedContainer = {
        ...mockContainer,
        status: 'RUNNING',
        dockerId: 'docker-456',
        port: 8002,
        startedAt: new Date(),
        lastActivity: new Date(),
      };

      // Mock database operations
      mockPrisma.container.findUnique.mockResolvedValue(mockContainer as any);
      mockPrisma.container.update
        .mockResolvedValueOnce({ ...mockContainer, status: 'STARTING' } as any) // Starting update
        .mockResolvedValueOnce(mockUpdatedContainer as any); // Final update
      mockPrisma.userEnv.findUnique.mockResolvedValue(null);
      mockPrisma.auditLog.create.mockResolvedValue({} as any);
      
      // Mock port allocation - return empty array for used ports
      mockPrisma.container.findMany.mockResolvedValue([]);

      const result = await containerManager.startContainer('container-123');

      expect(result.status).toBe('RUNNING');
      expect(result.port).toBe(8002);
      expect(result.dockerId).toBe('docker-456');

      expect(logContainerOperation).toHaveBeenCalledWith(
        'START',
        'container-123',
        'user-123',
        true,
        expect.any(Object)
      );
    });

    it('should handle container not found', async () => {
      mockPrisma.container.findUnique.mockResolvedValue(null);

      await expect(containerManager.startContainer('nonexistent')).rejects.toThrow(
        'Failed to start container'
      );

      expect(logError).toHaveBeenCalledWith(
        'Container start failed - not found',
        expect.any(Error),
        { containerId: 'nonexistent' }
      );
    });
  });

  describe('stopContainer', () => {
    it('should stop container successfully', async () => {
      const mockContainer = {
        id: 'container-123',
        userId: 'user-123',
        status: 'RUNNING',
        dockerId: 'docker-456',
        port: 8002,
      };

      const mockStoppedContainer = {
        ...mockContainer,
        status: 'STOPPED',
        dockerId: null,
        port: null,
        stoppedAt: new Date(),
        lastActivity: new Date(),
      };

      mockPrisma.container.findUnique.mockResolvedValue(mockContainer as any);
      mockPrisma.container.update
        .mockResolvedValueOnce({ ...mockContainer, status: 'STOPPING' } as any)
        .mockResolvedValueOnce(mockStoppedContainer as any);
      mockPrisma.auditLog.create.mockResolvedValue({} as any);

      const result = await containerManager.stopContainer('container-123');

      expect(result.status).toBe('STOPPED');
      expect(result.dockerId).toBeNull();
      expect(result.port).toBeNull();

      expect(logContainerOperation).toHaveBeenCalledWith(
        'STOP',
        'container-123',
        'user-123',
        true,
        expect.any(Object)
      );
    });
  });

  describe('cleanupIdleContainers', () => {
    it('should cleanup idle containers', async () => {
      const idleContainers = [
        {
          id: 'idle-1',
          userId: 'user-1',
          status: 'RUNNING',
          lastActivity: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
        },
        {
          id: 'idle-2',
          userId: 'user-2',
          status: 'RUNNING',
          lastActivity: new Date(Date.now() - 35 * 60 * 1000), // 35 minutes ago
        }
      ];

      mockPrisma.container.findMany.mockResolvedValue(idleContainers as any);
      mockPrisma.container.findUnique
        .mockResolvedValueOnce(idleContainers[0] as any)
        .mockResolvedValueOnce(idleContainers[1] as any);
      mockPrisma.container.update.mockResolvedValue({} as any);
      mockPrisma.auditLog.create.mockResolvedValue({} as any);

      await containerManager.cleanupIdleContainers(30); // 30 minute timeout

      expect(mockPrisma.container.findMany).toHaveBeenCalledWith({
        where: {
          status: 'RUNNING',
          lastActivity: {
            lt: expect.any(Date)
          }
        }
      });
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs for container', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'CREATE',
          containerId: 'container-123',
          userId: 'user-123',
          details: 'Container created',
          timestamp: new Date(),
        }
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs as any);

      const result = await containerManager.getAuditLogs({
        containerId: 'container-123',
        limit: 50
      });

      expect(result).toEqual(mockLogs);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { containerId: 'container-123' },
        orderBy: { timestamp: 'desc' },
        take: 50
      });
    });

    it('should handle audit log errors gracefully', async () => {
      mockPrisma.auditLog.findMany.mockRejectedValue(new Error('Database error'));

      const result = await containerManager.getAuditLogs({ userId: 'user-123' });

      expect(result).toEqual([]);
      expect(logError).toHaveBeenCalledWith(
        'Error getting audit logs',
        expect.any(Error),
        { userId: 'user-123' }
      );
    });
  });
}); 