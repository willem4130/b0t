import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { workflowsTable } from '@/lib/schema';
import { importWorkflow } from '@/lib/workflows/import-export';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/workflows/import
 * Import a workflow from JSON
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          error: 'Invalid workflow format',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }

    // Create workflow in database
    const id = randomUUID();

    await db.insert(workflowsTable).values({
      id,
      userId: session.user.id,
      organizationId: null,
      name: workflow.name,
      description: workflow.description,
      prompt: `Imported workflow: ${workflow.name}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: JSON.stringify(workflow.config) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trigger: JSON.stringify({ type: 'manual', config: {} }) as any,
      status: 'draft', // Imported workflows start as draft
    });

    logger.info(
      {
        userId: session.user.id,
        workflowId: id,
        workflowName: workflow.name,
        originalAuthor: workflow.metadata?.author,
      },
      'Workflow imported'
    );

    return NextResponse.json({
      id,
      name: workflow.name,
      requiredCredentials: workflow.metadata?.requiresCredentials || [],
    }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Failed to import workflow');
    return NextResponse.json(
      { error: 'Failed to import workflow' },
      { status: 500 }
    );
  }
}
