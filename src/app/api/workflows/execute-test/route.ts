import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { importWorkflow } from '@/lib/workflows/import-export';
import { executeWorkflow } from '@/lib/workflows/executor';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/execute-test
 * Test a workflow without authentication (local development only)
 *
 * This endpoint is for automated testing and LLM-generated workflow validation.
 * It temporarily imports, executes, and then deletes the workflow.
 *
 * SECURITY: Only available in development mode, not in production.
 */
export async function POST(request: NextRequest) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Test endpoint not available in production' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { workflowJson } = body;

    if (!workflowJson) {
      return NextResponse.json(
        { error: 'Missing required field: workflowJson' },
        { status: 400 }
      );
    }

    // Parse and validate workflow
    let workflow;
    try {
      workflow = importWorkflow(workflowJson);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid workflow format',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }

    // Create workflow in database (use test user ID '1')
    // Admin workflows use null organizationId (not tied to any organization)
    const workflowId = randomUUID();

    await db.insert(workflowsTable).values({
      id: workflowId,
      userId: '1', // Test user (admin)
      organizationId: null, // Admin workflows have null organizationId
      name: workflow.name,
      description: workflow.description,
      prompt: `Test workflow: ${workflow.name}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: JSON.stringify(workflow.config) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger: JSON.stringify({ type: 'manual', config: {} }) as any,
      status: 'draft',
    });

    logger.info(
      {
        workflowId,
        workflowName: workflow.name,
      },
      'Test workflow created'
    );

    // Generate mock trigger data based on trigger type
    const triggerType = workflow.trigger?.type || 'manual';
    let mockTriggerData: Record<string, unknown> = {};

    if (triggerType === 'chat') {
      // Chat trigger needs userMessage
      const triggerConfig = workflow.trigger?.config as { inputVariable?: string } | undefined;
      const inputVar = triggerConfig?.inputVariable || 'userMessage';
      mockTriggerData[inputVar] = 'What is 2 + 2?';
    } else if (triggerType === 'chat-input') {
      // Chat-input trigger needs all field values
      const triggerConfig = workflow.trigger?.config as { fields?: Array<{ key: string; label: string; type: string }> } | undefined;
      const fields = triggerConfig?.fields || [];
      for (const field of fields) {
        if (field.type === 'checkbox') {
          mockTriggerData[field.key] = true;
        } else if (field.type === 'number') {
          mockTriggerData[field.key] = 42;
        } else {
          mockTriggerData[field.key] = `Test ${field.label}`;
        }
      }
    } else if (triggerType === 'webhook') {
      mockTriggerData = {
        body: { test: 'data' },
        headers: {},
        query: {}
      };
    } else if (triggerType === 'telegram' || triggerType === 'discord') {
      mockTriggerData = {
        message: 'Test message',
        chatId: '12345',
        userId: '67890'
      };
    }

    // Execute the workflow
    const startTime = Date.now();
    const result = await executeWorkflow(workflowId, '1', triggerType, mockTriggerData);
    const duration = Date.now() - startTime;

    // Clean up - delete the test workflow
    await db
      .delete(workflowsTable)
      .where(eq(workflowsTable.id, workflowId));

    logger.info(
      {
        workflowId,
        success: result.success,
        duration,
      },
      'Test workflow executed and cleaned up'
    );

    // Return execution result
    return NextResponse.json({
      id: workflowId,
      name: workflow.name,
      success: result.success,
      output: result.output,
      error: result.error,
      errorStep: result.errorStep,
      duration,
      requiredCredentials: workflow.metadata?.requiresCredentials || [],
    }, { status: 200 }); // Always 200, check success field
  } catch (error) {
    logger.error({ error }, 'Failed to test workflow');
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test workflow',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
