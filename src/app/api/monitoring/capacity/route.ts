import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getWorkflowQueueStats } from '@/lib/workflows/workflow-queue';
import { workflowScheduler } from '@/lib/workflows/workflow-scheduler';
import { pool } from '@/lib/db';
import { auth } from '@/lib/auth';

/**
 * Capacity Monitoring API
 *
 * Returns system capacity metrics for workflow execution:
 * - Database connection pool usage
 * - Workflow queue statistics
 * - Scheduler status
 * - Resource utilization
 *
 * This helps identify bottlenecks and scaling needs.
 *
 * GET /api/monitoring/capacity
 */
export async function GET() {
  try {
    // Check authentication (admin only)
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get database pool stats
    const poolStats = {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
      maxConnections: parseInt(process.env.DB_POOL_MAX || '20', 10),
      utilizationPercent: Math.round(
        (pool.totalCount / parseInt(process.env.DB_POOL_MAX || '20', 10)) * 100
      ),
    };

    // Get workflow queue stats
    const queueStats = await getWorkflowQueueStats();

    // Get scheduler status
    const schedulerStatus = workflowScheduler.getStatus();

    // Calculate overall capacity metrics
    const capacity = {
      database: {
        status:
          poolStats.utilizationPercent > 90
            ? 'critical'
            : poolStats.utilizationPercent > 70
              ? 'warning'
              : 'healthy',
        ...poolStats,
      },
      queue: queueStats
        ? {
            status:
              queueStats.waiting > 100
                ? 'backlogged'
                : queueStats.active > 80
                  ? 'busy'
                  : 'healthy',
            ...queueStats,
            concurrency: parseInt(
              process.env.WORKFLOW_CONCURRENCY ||
                (process.env.NODE_ENV === 'production' ? '100' : '20'),
              10
            ),
          }
        : null,
      scheduler: {
        status: schedulerStatus.initialized ? 'running' : 'stopped',
        ...schedulerStatus,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        redisEnabled: !!process.env.REDIS_URL,
        workerMode: process.env.WORKER_MODE === 'true',
      },
      recommendations: getRecommendations(poolStats, queueStats),
    };

    return NextResponse.json(capacity);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'capacity_monitoring_fetch_failed'
      },
      'Capacity monitoring error'
    );
    return NextResponse.json(
      { error: 'Failed to fetch capacity metrics' },
      { status: 500 }
    );
  }
}

/**
 * Generate scaling recommendations based on current metrics
 */
function getRecommendations(
  poolStats: {
    utilizationPercent: number;
    waitingRequests: number;
  },
  queueStats: Awaited<ReturnType<typeof getWorkflowQueueStats>>
): string[] {
  const recommendations: string[] = [];

  // Database recommendations
  if (poolStats.utilizationPercent > 90) {
    recommendations.push(
      'Database pool at >90% capacity - increase DB_POOL_MAX or scale horizontally'
    );
  } else if (poolStats.waitingRequests > 5) {
    recommendations.push(
      'Database requests waiting for connections - increase DB_POOL_MAX'
    );
  }

  // Queue recommendations
  if (queueStats) {
    if (queueStats.waiting > 100) {
      recommendations.push(
        'Queue backlog detected (>100 waiting) - add more worker instances or increase WORKFLOW_CONCURRENCY'
      );
    } else if (queueStats.waiting > 50) {
      recommendations.push(
        'Queue building up (>50 waiting) - monitor closely or scale up'
      );
    }

    if (queueStats.failed > 100) {
      recommendations.push(
        'High failure rate detected - investigate error logs'
      );
    }

    const utilizationPercent = Math.round(
      (queueStats.active /
        parseInt(
          process.env.WORKFLOW_CONCURRENCY ||
            (process.env.NODE_ENV === 'production' ? '100' : '20'),
          10
        )) *
        100
    );

    if (utilizationPercent > 80) {
      recommendations.push(
        'Workflow queue at >80% capacity - consider increasing WORKFLOW_CONCURRENCY'
      );
    }
  }

  // No Redis warning
  if (!process.env.REDIS_URL) {
    recommendations.push(
      'Redis not configured - workflow queue disabled, limiting scalability'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('System running optimally - no scaling needed');
  }

  return recommendations;
}
