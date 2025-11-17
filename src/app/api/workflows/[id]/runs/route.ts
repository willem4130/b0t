import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { workflowRunsTable, workflowsTable } from '@/lib/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows/[id]/runs
 * Get execution history for a workflow
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // First verify the workflow belongs to this user
    const workflow = await db
      .select({ userId: workflowsTable.userId })
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .limit(1);

    if (workflow.length === 0) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (workflow[0].userId !== session.user.id) {
      logger.warn(
        { workflowId: id, userId: session.user.id, ownerId: workflow[0].userId },
        'Unauthorized access attempt to workflow runs'
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get limit and offset from query params
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Get runs for this workflow
    const runs = await db
      .select({
        id: workflowRunsTable.id,
        status: workflowRunsTable.status,
        startedAt: workflowRunsTable.startedAt,
        completedAt: workflowRunsTable.completedAt,
        duration: workflowRunsTable.duration,
        error: workflowRunsTable.error,
        errorStep: workflowRunsTable.errorStep,
        output: workflowRunsTable.output,
        triggerType: workflowRunsTable.triggerType,
      })
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.workflowId, id))
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(limit)
      .offset(offset);

    // Parse JSON fields (output is stored as text)
    const parsedRuns = runs.map((run) => ({
      ...run,
      output: run.output ? JSON.parse(run.output as string) : null,
    }));

    return NextResponse.json({ runs: parsedRuns });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        workflowId: id,
        action: 'workflow_runs_fetch_failed'
      },
      'Failed to fetch workflow runs'
    );
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
