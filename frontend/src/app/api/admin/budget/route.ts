import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logInfo, logError } from '@/lib/logger';
import { containerPool } from '@/lib/container-pool';
import { getAllCircuitBreakerStats } from '@/lib/circuit-breaker';

interface BudgetStatus {
  period: string;
  budget: {
    total: number;
    compute: number;
    storage: number;
    networking: number;
    used: number;
    remaining: number;
    percentageUsed: number;
  };
  usage: {
    containers: {
      active: number;
      total: number;
      pooled: number;
    };
    resources: {
      cpu: string;
      memory: string;
      storage: string;
    };
    costs: {
      estimated: number;
      breakdown: {
        compute: number;
        storage: number;
        networking: number;
      };
    };
  };
  alerts: Array<{
    level: 'warning' | 'critical' | 'emergency';
    message: string;
    threshold: number;
    current: number;
  }>;
  recommendations: Array<{
    type: 'cost_optimization' | 'resource_rightsizing' | 'cleanup';
    title: string;
    description: string;
    potentialSavings: number;
  }>;
}

export async function GET(request: NextRequest) {
  try {
    logInfo('Budget monitoring request received');
    
    // Get current month period
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Fetch container statistics
    const containers = await prisma.container.findMany({
      where: {
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1)
        }
      },
      include: {
        user: {
          select: {
            email: true
          }
        }
      }
    });

    const activeContainers = containers.filter((c: any) => c.status === 'RUNNING').length;
    const totalContainers = containers.length;
    
    // Get container pool stats
    const poolStats = containerPool.getPoolStats();
    
    // Calculate resource usage (simplified estimates)
    const cpuUsage = containers.reduce((sum: number, c: any) => sum + (c.cpuLimit || 0.5), 0);
    const memoryUsage = containers.reduce((sum: number, c: any) => sum + (c.memoryLimit || 512), 0);
    const storageUsage = containers.reduce((sum: number, c: any) => sum + (c.storageLimit || 1024), 0);
    
    // Cost estimation (simplified - in production, integrate with cloud provider APIs)
    const computeCostPerHour = 0.10; // $0.10 per vCPU hour
    const memoryCostPerGBHour = 0.02; // $0.02 per GB RAM hour
    const storageCostPerGBMonth = 0.05; // $0.05 per GB storage month
    
    const hoursInMonth = 24 * 30; // Approximate
    const estimatedComputeCost = cpuUsage * computeCostPerHour * hoursInMonth;
    const estimatedMemoryCost = (memoryUsage / 1024) * memoryCostPerGBHour * hoursInMonth;
    const estimatedStorageCost = (storageUsage / 1024) * storageCostPerGBMonth;
    const estimatedNetworkingCost = activeContainers * 5; // $5 per active container for networking
    
    const totalEstimatedCost = estimatedComputeCost + estimatedMemoryCost + estimatedStorageCost + estimatedNetworkingCost;
    
    // Budget configuration (in production, store in database or config)
    const monthlyBudget = {
      total: 1000,
      compute: 600,
      storage: 200,
      networking: 200
    };
    
    const percentageUsed = (totalEstimatedCost / monthlyBudget.total) * 100;
    
    // Generate alerts
    const alerts: any[] = [];
    if (percentageUsed >= 100) {
      alerts.push({
        level: 'emergency',
        message: 'Budget exceeded! Immediate action required.',
        threshold: 100,
        current: percentageUsed
      });
    } else if (percentageUsed >= 95) {
      alerts.push({
        level: 'critical',
        message: 'Budget usage critical. Consider scaling down resources.',
        threshold: 95,
        current: percentageUsed
      });
    } else if (percentageUsed >= 80) {
      alerts.push({
        level: 'warning',
        message: 'Budget usage approaching limit. Monitor closely.',
        threshold: 80,
        current: percentageUsed
      });
    }
    
    // Generate cost optimization recommendations
    const recommendations: any[] = [];
    
    // Idle container detection
    const idleContainers = containers.filter((c: any) => {
      if (!c.lastActivity) return false;
      const idleTime = Date.now() - c.lastActivity.getTime();
      return idleTime > 30 * 60 * 1000; // 30 minutes
    });
    
    if (idleContainers.length > 0) {
      recommendations.push({
        type: 'cleanup',
        title: 'Clean up idle containers',
        description: `${idleContainers.length} containers have been idle for over 30 minutes`,
        potentialSavings: idleContainers.length * 10 // $10 per container
      });
    }
    
    // Over-provisioned containers
    const overProvisionedContainers = containers.filter((c: any) => 
      (c.cpuLimit || 0) > 1 || (c.memoryLimit || 0) > 1024
    );
    
    if (overProvisionedContainers.length > 0) {
      recommendations.push({
        type: 'resource_rightsizing',
        title: 'Right-size over-provisioned containers',
        description: `${overProvisionedContainers.length} containers may be over-provisioned`,
        potentialSavings: overProvisionedContainers.length * 25 // $25 per container
      });
    }
    
    // Pool optimization
    if (poolStats.availableContainers > 3) {
      recommendations.push({
        type: 'cost_optimization',
        title: 'Optimize container pool size',
        description: `Container pool has ${poolStats.availableContainers} unused containers`,
        potentialSavings: poolStats.availableContainers * 5 // $5 per pooled container
      });
    }
    
    const budgetStatus: BudgetStatus = {
      period,
      budget: {
        total: monthlyBudget.total,
        compute: monthlyBudget.compute,
        storage: monthlyBudget.storage,
        networking: monthlyBudget.networking,
        used: Math.round(totalEstimatedCost),
        remaining: Math.round(monthlyBudget.total - totalEstimatedCost),
        percentageUsed: Math.round(percentageUsed * 100) / 100
      },
      usage: {
        containers: {
          active: activeContainers,
          total: totalContainers,
          pooled: poolStats.totalContainers
        },
        resources: {
          cpu: `${cpuUsage.toFixed(1)} vCPUs`,
          memory: `${(memoryUsage / 1024).toFixed(1)} GB`,
          storage: `${(storageUsage / 1024).toFixed(1)} GB`
        },
        costs: {
          estimated: Math.round(totalEstimatedCost),
          breakdown: {
            compute: Math.round(estimatedComputeCost + estimatedMemoryCost),
            storage: Math.round(estimatedStorageCost),
            networking: Math.round(estimatedNetworkingCost)
          }
        }
      },
      alerts,
      recommendations
    };
    
    logInfo('Budget status calculated', {
      period,
      totalCost: totalEstimatedCost,
      percentageUsed,
      alertCount: alerts.length,
      recommendationCount: recommendations.length
    });
    
    return NextResponse.json(budgetStatus);
    
  } catch (error) {
    logError('Error fetching budget status', error);
    return NextResponse.json(
      { error: 'Failed to fetch budget status' },
      { status: 500 }
    );
  }
}

// POST endpoint for updating budget configurations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { budget, alerts, optimization } = body;
    
    logInfo('Budget configuration update requested', {
      budget,
      alerts,
      optimization
    });
    
    // In production, save configuration to database
    // For now, just return success
    
    return NextResponse.json({
      message: 'Budget configuration updated successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logError('Error updating budget configuration', error);
    return NextResponse.json(
      { error: 'Failed to update budget configuration' },
      { status: 500 }
    );
  }
}

// GET endpoint for cost optimization actions
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, parameters } = body;
    
    logInfo('Cost optimization action requested', {
      action,
      parameters
    });
    
    let result: any = { success: true };
    
    switch (action) {
      case 'cleanup_idle_containers':
        const idleTimeout = parameters?.timeout || 30; // minutes
        const containers = await prisma.container.findMany({
          where: {
            status: 'RUNNING',
            lastActivity: {
              lt: new Date(Date.now() - idleTimeout * 60 * 1000)
            }
          }
        });
        
        result.containersFound = containers.length;
        result.message = `Found ${containers.length} idle containers for cleanup`;
        break;
        
      case 'optimize_pool_size':
        const poolStats = containerPool.getPoolStats();
        result.currentPoolSize = poolStats.totalContainers;
        result.availableContainers = poolStats.availableContainers;
        result.recommendation = poolStats.availableContainers > 3 
          ? 'Reduce pool size'
          : 'Pool size is optimal';
        break;
        
      case 'rightsizing_analysis':
        const oversizedContainers = await prisma.container.findMany({
          where: {
            OR: [
              { cpuLimit: { gt: 1 } },
              { memoryLimit: { gt: 1024 } }
            ]
          }
        });
        
        result.oversizedContainers = oversizedContainers.length;
        result.potentialSavings = oversizedContainers.length * 25;
        break;
        
      default:
        return NextResponse.json(
          { error: 'Unknown optimization action' },
          { status: 400 }
        );
    }
    
    return NextResponse.json(result);
    
  } catch (error) {
    logError('Error executing cost optimization action', error);
    return NextResponse.json(
      { error: 'Failed to execute optimization action' },
      { status: 500 }
    );
  }
} 