import { logError, logWarn, logInfo } from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;     // Number of failures before opening circuit
  recoveryTimeout: number;      // Time to wait before trying again (ms)
  monitoringPeriod: number;     // Time window for failure counting (ms)
  expectedFailureRate: number;  // Acceptable failure rate (0-1)
  minimumRequestThreshold: number; // Minimum requests before calculating failure rate
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private readonly name: string;
  private readonly options: CircuitBreakerOptions;
  private readonly requestHistory: { timestamp: number; success: boolean }[] = [];

  constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
    this.name = name;
    this.options = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 120000, // 2 minutes
      expectedFailureRate: 0.5, // 50%
      minimumRequestThreshold: 10,
      ...options
    };

    logInfo('Circuit breaker initialized', {
      name: this.name,
      options: this.options
    });
  }

  async execute<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        logWarn('Circuit breaker is OPEN, executing fallback', {
          name: this.name,
          nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
        });
        
        if (fallback) {
          return await fallback();
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      } else {
        // Time to test if service has recovered
        this.state = CircuitState.HALF_OPEN;
        logInfo('Circuit breaker moved to HALF_OPEN state', { name: this.name });
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      // Re-check state after failure handling since onFailure can change it
      const currentState = this.getState();
      if (fallback && currentState === CircuitState.OPEN) {
        logWarn('Circuit breaker operation failed, executing fallback', {
          name: this.name,
          error: String(error)
        });
        return await fallback();
      }
      
      throw error;
    }
  }

  private onSuccess(): void {
    this.recordRequest(true);
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Service has recovered, close the circuit
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      logInfo('Circuit breaker recovered, state changed to CLOSED', {
        name: this.name,
        successCount: this.successCount
      });
    }
  }

  private onFailure(): void {
    this.recordRequest(false);
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Still failing in half-open state, go back to open
      this.openCircuit();
    } else if (this.shouldOpenCircuit()) {
      this.openCircuit();
    }
  }

  private shouldOpenCircuit(): boolean {
    // Clean old requests outside monitoring period
    this.cleanOldRequests();

    const totalRequests = this.requestHistory.length;
    
    // Need minimum requests to make a decision
    if (totalRequests < this.options.minimumRequestThreshold) {
      return false;
    }

    const failures = this.requestHistory.filter(req => !req.success).length;
    const failureRate = failures / totalRequests;

    logDebug('Circuit breaker failure rate check', {
      name: this.name,
      totalRequests,
      failures,
      failureRate,
      threshold: this.options.expectedFailureRate
    });

    return failureRate > this.options.expectedFailureRate;
  }

  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
    
    logError('Circuit breaker opened due to failures', new Error('Circuit breaker opened'), {
      name: this.name,
      failureCount: this.failureCount,
      nextAttemptTime: new Date(this.nextAttemptTime).toISOString()
    });
  }

  private recordRequest(success: boolean): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      success
    });

    // Keep only recent requests
    this.cleanOldRequests();
  }

  private cleanOldRequests(): void {
    const cutoffTime = Date.now() - this.options.monitoringPeriod;
    const initialLength = this.requestHistory.length;
    
    // Remove old requests
    for (let i = this.requestHistory.length - 1; i >= 0; i--) {
      if (this.requestHistory[i].timestamp < cutoffTime) {
        this.requestHistory.splice(i, 1);
      }
    }

    if (this.requestHistory.length !== initialLength) {
      logDebug('Cleaned old requests from circuit breaker history', {
        name: this.name,
        removedCount: initialLength - this.requestHistory.length,
        remainingCount: this.requestHistory.length
      });
    }
  }

  // Public getters for monitoring
  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    this.cleanOldRequests();
    const totalRequests = this.requestHistory.length;
    const failures = this.requestHistory.filter(req => !req.success).length;
    const failureRate = totalRequests > 0 ? failures / totalRequests : 0;

    return {
      name: this.name,
      state: this.state,
      totalRequests,
      failures,
      failureRate,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null
    };
  }

  // Force state changes for testing/admin purposes
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
    logWarn('Circuit breaker manually forced to OPEN state', { name: this.name });
  }

  forceClose(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.nextAttemptTime = 0;
    logInfo('Circuit breaker manually forced to CLOSED state', { name: this.name });
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.requestHistory.length = 0;
    logInfo('Circuit breaker reset', { name: this.name });
  }
}

// Create circuit breakers for critical dependencies
export const circuitBreakers = {
  database: new CircuitBreaker('database', {
    failureThreshold: 3,
    recoveryTimeout: 30000, // 30 seconds
    expectedFailureRate: 0.3, // 30%
    minimumRequestThreshold: 5
  }),
  
  docker: new CircuitBreaker('docker', {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    expectedFailureRate: 0.4, // 40%
    minimumRequestThreshold: 8
  }),
  
  auth0: new CircuitBreaker('auth0', {
    failureThreshold: 3,
    recoveryTimeout: 45000, // 45 seconds
    expectedFailureRate: 0.2, // 20%
    minimumRequestThreshold: 10
  })
};

// Utility function to get all circuit breaker stats
export function getAllCircuitBreakerStats() {
  return Object.entries(circuitBreakers).map(([name, breaker]) => breaker.getStats());
}

// Helper function for debugging
function logDebug(message: string, meta?: any): void {
  if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'debug') {
    logInfo(message, meta);
  }
} 