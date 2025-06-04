// Unmock the circuit-breaker for this test file
jest.unmock('@/lib/circuit-breaker');

import { CircuitBreaker, CircuitState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000, // 1 second for fast tests
      monitoringPeriod: 5000, // 5 seconds
      expectedFailureRate: 0.5, // 50%
      minimumRequestThreshold: 5
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should have correct initial stats', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalRequests).toBe(0);
      expect(stats.failures).toBe(0);
      expect(stats.failureRate).toBe(0);
    });
  });

  describe('successful operations', () => {
    it('should execute successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain closed with successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      // Execute multiple successful operations
      for (let i = 0; i < 10; i++) {
        await circuitBreaker.execute(mockOperation);
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(mockOperation).toHaveBeenCalledTimes(10);
    });
  });

  describe('failed operations', () => {
    it('should handle individual failures without opening', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Test error');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold is exceeded', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Execute enough failures to exceed threshold (need minimum requests first)
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(jest.fn().mockResolvedValue('success')).catch(() => {});
      }
      
      // Now add failures
      for (let i = 0; i < 4; i++) {
        await circuitBreaker.execute(mockOperation).catch(() => {});
      }
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should execute fallback when circuit is open', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      const mockFallback = jest.fn().mockResolvedValue('fallback result');
      
      // Force circuit to open
      circuitBreaker.forceOpen();
      
      const result = await circuitBreaker.execute(mockOperation, mockFallback);
      
      expect(result).toBe('fallback result');
      expect(mockOperation).not.toHaveBeenCalled();
      expect(mockFallback).toHaveBeenCalledTimes(1);
    });

    it('should throw error when circuit is open and no fallback provided', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      circuitBreaker.forceOpen();
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow(
        'Circuit breaker test-service is OPEN'
      );
    });
  });

  describe('half-open state and recovery', () => {
    it('should transition to half-open after recovery timeout', async () => {
      // Force circuit open
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Next operation should transition to half-open
      const mockOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should close circuit on successful operation in half-open state', async () => {
      circuitBreaker.forceOpen();
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const mockOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(mockOperation);
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should reopen circuit on failed operation in half-open state', async () => {
      circuitBreaker.forceOpen();
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const mockOperation = jest.fn().mockRejectedValue(new Error('Still failing'));
      
      await expect(circuitBreaker.execute(mockOperation)).rejects.toThrow('Still failing');
      
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('statistics and monitoring', () => {
    it('should track request statistics correctly', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Execute mixed operations
      await circuitBreaker.execute(successOp);
      await circuitBreaker.execute(successOp);
      await circuitBreaker.execute(failOp).catch(() => {});
      await circuitBreaker.execute(successOp);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(4);
      expect(stats.failures).toBe(1);
      expect(stats.failureRate).toBe(0.25);
    });

    it('should clean old requests from monitoring window', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockOperation);
      
      // Wait longer than monitoring period
      await new Promise(resolve => setTimeout(resolve, 6000));
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(0); // Should be cleaned up
    });
  });

  describe('manual controls', () => {
    it('should allow manual circuit opening', () => {
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should allow manual circuit closing', () => {
      circuitBreaker.forceOpen();
      circuitBreaker.forceClose();
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should allow circuit reset', () => {
      // Add some history
      circuitBreaker.forceOpen();
      
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.failures).toBe(0);
    });
  });

  describe('fallback integration', () => {
    it('should execute fallback when operation fails and circuit is closed', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Primary failed'));
      const mockFallback = jest.fn().mockResolvedValue('fallback success');
      
      // For a newly opened circuit, the fallback should execute
      circuitBreaker.forceOpen();
      
      const result = await circuitBreaker.execute(mockOperation, mockFallback);
      
      expect(result).toBe('fallback success');
      expect(mockFallback).toHaveBeenCalledTimes(1);
    });

    it('should not execute fallback when operation succeeds', async () => {
      const mockOperation = jest.fn().mockResolvedValue('primary success');
      const mockFallback = jest.fn().mockResolvedValue('fallback success');
      
      const result = await circuitBreaker.execute(mockOperation, mockFallback);
      
      expect(result).toBe('primary success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(mockFallback).not.toHaveBeenCalled();
    });
  });
}); 