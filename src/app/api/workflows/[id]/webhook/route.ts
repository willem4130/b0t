import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { queueWorkflowExecution } from '@/lib/workflows/workflow-queue';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/[id]/webhook
 * Trigger a workflow via webhook
 *
 * Only executes if:
 * 1. Workflow exists
 * 2. Workflow status is 'active'
 * 3. Workflow trigger type is 'webhook'
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Get the workflow
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .limit(1);

    if (workflows.length === 0) {
      logger.warn({ workflowId: id }, 'Webhook called for non-existent workflow');
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    const workflow = workflows[0];

    // Check if workflow is active
    if (workflow.status !== 'active') {
      logger.warn(
        { workflowId: id, status: workflow.status },
        'Webhook called for inactive workflow'
      );
      return NextResponse.json(
        { error: 'Workflow is not active', status: workflow.status },
        { status: 403 }
      );
    }

    // Check if trigger type is webhook
    const trigger = workflow.trigger as { type: string; config: Record<string, unknown> };
    if (trigger.type !== 'webhook') {
      logger.warn(
        { workflowId: id, triggerType: trigger.type },
        'Webhook called for non-webhook trigger workflow'
      );
      return NextResponse.json(
        { error: 'Workflow trigger is not webhook', triggerType: trigger.type },
        { status: 400 }
      );
    }

    // Parse webhook payload
    const body = await request.json().catch(() => ({}));
    const headers = Object.fromEntries(request.headers.entries());
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    // Queue workflow execution with webhook data
    await queueWorkflowExecution(
      id,
      workflow.userId,
      'webhook',
      {
        body,
        headers,
        query: queryParams,
        method: request.method,
        url: url.pathname,
      }
    );

    logger.info(
      {
        workflowId: id,
        userId: workflow.userId,
        hasBody: Object.keys(body).length > 0,
        hasQuery: Object.keys(queryParams).length > 0,
      },
      'Webhook workflow queued for execution'
    );

    return NextResponse.json({
      success: true,
      workflowId: id,
      workflowName: workflow.name,
      queued: true,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to process webhook');
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflows/[id]/webhook
 * Get webhook URL and status
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Get the workflow
    const workflows = await db
      .select({
        id: workflowsTable.id,
        name: workflowsTable.name,
        status: workflowsTable.status,
        trigger: workflowsTable.trigger,
      })
      .from(workflowsTable)
      .where(eq(workflowsTable.id, id))
      .limit(1);

    if (workflows.length === 0) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: 404 }
      );
    }

    const workflow = workflows[0];
    const trigger = workflow.trigger as { type: string; config: Record<string, unknown> };

    if (trigger.type !== 'webhook') {
      return NextResponse.json(
        { error: 'Workflow trigger is not webhook' },
        { status: 400 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const webhookUrl = `${baseUrl}/api/workflows/${id}/webhook`;

    return NextResponse.json({
      workflowId: id,
      workflowName: workflow.name,
      webhookUrl,
      status: workflow.status,
      active: workflow.status === 'active',
      triggerType: trigger.type,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get webhook info');
    return NextResponse.json(
      { error: 'Failed to get webhook info' },
      { status: 500 }
    );
  }
}
