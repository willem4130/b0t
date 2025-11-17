import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { queueWorkflowExecution, isWorkflowQueueAvailable } from '@/lib/workflows/workflow-queue';
import { executeWorkflow } from '@/lib/workflows/executor';
import { checkStrictRateLimit } from '@/lib/ratelimit';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/[id]/run
 * Execute a workflow manually
 *
 * Uses queue system if Redis is configured, otherwise executes directly.
 * Queue system provides:
 * - Controlled concurrency (prevents resource exhaustion)
 * - Automatic retries on failure
 * - Job prioritization
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Apply rate limiting (3 requests per minute)
  const rateLimitResult = await checkStrictRateLimit(request);
  if (rateLimitResult) return rateLimitResult;

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify workflow ownership
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, id),
          eq(workflowsTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (workflows.length === 0) {
      logger.warn(
        { workflowId: id, userId: session.user.id },
        'Workflow not found or access denied'
      );
      return NextResponse.json(
        { error: 'Workflow not found or access denied' },
        { status: 404 }
      );
    }

    // Optional: Accept trigger data, trigger type, and priority from request body
    const body = await request.json().catch(() => ({}));
    const triggerData = body.triggerData || {};
    const triggerType = body.triggerType || 'manual';
    const priority = body.priority as number | undefined;

    // Use queue if available, otherwise execute directly
    if (isWorkflowQueueAvailable()) {
      const { jobId, queued } = await queueWorkflowExecution(
        id,
        session.user.id,
        triggerType,
        triggerData,
        { priority }
      );

      return NextResponse.json({
        success: true,
        queued,
        jobId,
        message: 'Workflow queued for execution',
      });
    }

    // Fallback: Direct execution (no Redis)
    const result = await executeWorkflow(
      id,
      session.user.id,
      triggerType,
      triggerData
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          errorStep: result.errorStep,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      output: result.output,
      queued: false,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id,
        action: 'workflow_execution_failed'
      },
      'Failed to execute workflow'
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
