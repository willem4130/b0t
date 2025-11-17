import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { chatConversationsTable, workflowsTable } from '@/lib/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows/[id]/conversations
 * List all conversations for a workflow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;

  try {
    // Verify workflow exists
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, workflowId))
      .limit(1);

    if (workflows.length === 0) {
      logger.warn({ workflowId }, 'Workflow not found');
      return new Response('Workflow not found', { status: 404 });
    }

    const workflow = workflows[0];

    // Fetch conversations for this workflow
    const conversations = await db
      .select()
      .from(chatConversationsTable)
      .where(
        and(
          eq(chatConversationsTable.workflowId, workflowId),
          eq(chatConversationsTable.status, 'active')
        )
      )
      .orderBy(desc(chatConversationsTable.updatedAt))
      .limit(50); // Limit to 50 most recent conversations

    return Response.json({
      conversations,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        trigger: workflow.trigger,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ workflowId, error: errorMessage }, 'Failed to fetch conversations');
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
