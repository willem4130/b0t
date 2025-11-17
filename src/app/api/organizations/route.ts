import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getUserOrganizations, createOrganization } from '@/lib/organizations';
import { z } from 'zod';
import { logger } from '@/lib/logger';

/**
 * GET /api/organizations
 * List all organizations the current user belongs to
 */
export async function GET() {
  try {
    const session = await requireAuth();

    const organizations = await getUserOrganizations(session.user.id);

    logger.info(
      { userId: session.user.id, organizationCount: organizations.length, action: 'organizations_fetch_success' },
      'Organizations fetched successfully'
    );

    return NextResponse.json({
      success: true,
      organizations,
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), action: 'organizations_fetch_failed' },
      'Failed to fetch organizations'
    );

    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/organizations
 * Create a new organization
 */
const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const body = await request.json();
    const { name, plan } = createOrgSchema.parse(body);

    const organization = await createOrganization(name, session.user.id, plan);

    logger.info(
      { userId: session.user.id, organizationId: organization.id, organizationName: name, plan: plan || 'free', action: 'organization_create_success' },
      'Organization created successfully'
    );

    return NextResponse.json({
      success: true,
      organization,
    }, { status: 201 });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), action: 'organization_create_failed' },
      'Failed to create organization'
    );

    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}
