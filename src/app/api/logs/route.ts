import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { workflowRunsTable, workflowsTable, organizationMembersTable } from '@/lib/schema';
import { desc, eq, and, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const workflowId = searchParams.get('workflowId');
    const organizationId = searchParams.get('organizationId');

    // If organizationId is provided, verify user has access
    if (organizationId) {
      const membership = await db
        .select()
        .from(organizationMembersTable)
        .where(
          and(
            eq(organizationMembersTable.organizationId, organizationId),
            eq(organizationMembersTable.userId, userId)
          )
        )
        .limit(1);

      if (membership.length === 0) {
        logger.warn(
          { userId, organizationId },
          'Unauthorized access attempt to organization logs'
        );
        return NextResponse.json({ error: 'Unauthorized access to organization' }, { status: 403 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any;

    // Build where conditions - always filter by userId to ensure users only see their own logs
    const whereConditions = [eq(workflowRunsTable.userId, userId)];

    if (workflowId) {
      whereConditions.push(eq(workflowRunsTable.workflowId, workflowId));
    }
    if (organizationId) {
      // Filter by specific organization (already verified access above)
      whereConditions.push(eq(workflowRunsTable.organizationId, organizationId));
    } else {
      // Show only user's personal activity (not tied to any organization)
      whereConditions.push(isNull(workflowRunsTable.organizationId));
    }

    // Build query for workflow runs
    const runs = await dbAny
      .select({
        id: workflowRunsTable.id,
        workflowId: workflowRunsTable.workflowId,
        status: workflowRunsTable.status,
        startedAt: workflowRunsTable.startedAt,
        completedAt: workflowRunsTable.completedAt,
        duration: workflowRunsTable.duration,
        output: workflowRunsTable.output,
        error: workflowRunsTable.error,
        errorStep: workflowRunsTable.errorStep,
        workflowName: workflowsTable.name,
      })
      .from(workflowRunsTable)
      .leftJoin(workflowsTable, eq(workflowRunsTable.workflowId, workflowsTable.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(workflowRunsTable.startedAt))
      .limit(Math.min(limit, 50)) // Max 50 logs per page
      .offset(offset);

    // Transform to match old format expected by Activity page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = runs.map((run: any) => ({
      id: run.id,
      jobName: run.workflowName || 'Unknown Workflow',
      status: run.status,
      message: run.status === 'success' ? 'Workflow completed successfully' : (run.error || 'Workflow execution failed'),
      details: run.errorStep ? `Failed at step: ${run.errorStep}` : null,
      duration: run.duration,
      createdAt: run.startedAt,
    }));

    return NextResponse.json({ logs, limit, offset });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'logs_fetch_failed'
      },
      'Error fetching logs'
    );
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
