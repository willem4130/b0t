import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getUserOrganizations, createOrganization } from '@/lib/organizations';
import { logger } from '@/lib/logger';

/**
 * GET /api/clients
 * Get all organizations (clients) the current user belongs to
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgs = await getUserOrganizations(session.user.id);

    // Sort by name to ensure consistent ordering
    const sortedOrgs = orgs.sort((a, b) => a.name.localeCompare(b.name));

    logger.info(
      { userId: session.user.id, clientCount: sortedOrgs.length, action: 'clients_fetch_success' },
      'Clients fetched successfully'
    );

    return NextResponse.json({
      clients: sortedOrgs.map(org => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: org.role,
        plan: org.plan || 'free',
        status: org.status || 'active',
        createdAt: org.createdAt,
      })),
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), action: 'clients_fetch_failed' },
      'Failed to fetch clients'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/clients
 * Create a new client organization
 */
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
    }

    // Create the organization
    const org = await createOrganization(name, session.user.id, 'free');

    logger.info(
      { userId: session.user.id, clientId: org.id, clientName: name, action: 'client_create_success' },
      'Client created successfully'
    );

    return NextResponse.json({
      client: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: 'owner',
      },
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), action: 'client_create_failed' },
      'Failed to create client'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
