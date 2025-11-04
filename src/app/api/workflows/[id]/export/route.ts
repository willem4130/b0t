import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { useSQLite, sqliteDb, postgresDb } from '@/lib/db';
import { workflowsTableSQLite, workflowsTablePostgres } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { exportWorkflow } from '@/lib/workflows/import-export';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/workflows/[id]/export
 * Export a workflow to JSON format
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    if (useSQLite) {
      if (!sqliteDb) {
        throw new Error('SQLite database not initialized');
      }

      // Get workflow (SQLite)
      const workflows = await sqliteDb
        .select()
        .from(workflowsTableSQLite)
        .where(
          and(
            eq(workflowsTableSQLite.id, id),
            eq(workflowsTableSQLite.userId, session.user.id)
          )
        )
        .limit(1);

      if (workflows.length === 0) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }

      const workflow = workflows[0];

      // Export workflow
      const config = workflow.config as { steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }> };
      const exported = exportWorkflow(
        workflow.name,
        workflow.description || '',
        config,
        {
          author: session.user.email || undefined,
        }
      );

      logger.info(
        { userId: session.user.id, workflowId: id, workflowName: workflow.name },
        'Workflow exported'
      );

      return NextResponse.json(exported);
    } else {
      if (!postgresDb) {
        throw new Error('PostgreSQL database not initialized');
      }

      // Get workflow (PostgreSQL)
      const workflows = await postgresDb
        .select()
        .from(workflowsTablePostgres)
        .where(
          and(
            eq(workflowsTablePostgres.id, id),
            eq(workflowsTablePostgres.userId, session.user.id)
          )
        )
        .limit(1);

      if (workflows.length === 0) {
        return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
      }

      const workflow = workflows[0];

      // Export workflow
      const config = workflow.config as { steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }> };
      const exported = exportWorkflow(
        workflow.name,
        workflow.description || '',
        config,
        {
          author: session.user.email || undefined,
        }
      );

      logger.info(
        { userId: session.user.id, workflowId: id, workflowName: workflow.name },
        'Workflow exported'
      );

      return NextResponse.json(exported);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to export workflow');
    return NextResponse.json(
      { error: 'Failed to export workflow' },
      { status: 500 }
    );
  }
}
