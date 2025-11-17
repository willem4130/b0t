import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflowsTable, chatConversationsTable } from '@/lib/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows
 * List all workflows for the authenticated user
 * Query params:
 *   - organizationId: Filter by organization/client
 *   - page: Page number (default: 1)
 *   - limit: Items per page (default: 50, max: 100)
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    // Build where clause
    const whereConditions = [eq(workflowsTable.userId, session.user.id)];

    if (organizationId) {
      // Filter by specific organization
      whereConditions.push(eq(workflowsTable.organizationId, organizationId));
    } else {
      // Show only admin's personal workflows (not tied to any organization)
      whereConditions.push(isNull(workflowsTable.organizationId));
    }

    // Fetch workflows with conversation counts in a single query using LEFT JOIN
    const rawWorkflows = await db
      .select({
        id: workflowsTable.id,
        name: workflowsTable.name,
        description: workflowsTable.description,
        status: workflowsTable.status,
        trigger: workflowsTable.trigger,
        config: workflowsTable.config,
        createdAt: workflowsTable.createdAt,
        lastRun: workflowsTable.lastRun,
        lastRunStatus: workflowsTable.lastRunStatus,
        lastRunOutput: workflowsTable.lastRunOutput,
        runCount: workflowsTable.runCount,
        conversationCount: sql<number>`COALESCE(COUNT(CASE WHEN ${chatConversationsTable.status} = 'active' THEN 1 END), 0)`.as('conversation_count'),
      })
      .from(workflowsTable)
      .leftJoin(
        chatConversationsTable,
        eq(chatConversationsTable.workflowId, workflowsTable.id)
      )
      .where(and(...whereConditions))
      .groupBy(
        workflowsTable.id,
        workflowsTable.name,
        workflowsTable.description,
        workflowsTable.status,
        workflowsTable.trigger,
        workflowsTable.config,
        workflowsTable.createdAt,
        workflowsTable.lastRun,
        workflowsTable.lastRunStatus,
        workflowsTable.lastRunOutput,
        workflowsTable.runCount
      )
      .orderBy(workflowsTable.createdAt)
      .limit(limit)
      .offset(offset);

    // Get total count for pagination metadata
    const totalCountResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${workflowsTable.id})` })
      .from(workflowsTable)
      .where(and(...whereConditions));

    const totalCount = totalCountResult[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Parse config and trigger if they're strings
    const workflows = rawWorkflows.map((workflow) => {
      return {
        ...workflow,
        config: typeof workflow.config === 'string' ? JSON.parse(workflow.config) : workflow.config,
        trigger: typeof workflow.trigger === 'string' ? JSON.parse(workflow.trigger) : workflow.trigger,
        conversationCount: workflow.conversationCount,
      };
    });

    return NextResponse.json({
      workflows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        action: 'workflows_list_failed'
      },
      'Failed to list workflows'
    );
    return NextResponse.json(
      { error: 'Failed to list workflows' },
      { status: 500 }
    );
  }
}
