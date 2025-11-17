import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { deleteCredential, updateCredential } from '@/lib/workflows/credentials';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/credentials/[id]
 * Update a credential's name and/or value
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { value, name } = body;

    // At least one field must be provided
    if (!value && !name) {
      return NextResponse.json(
        { error: 'At least one field (name or value) must be provided' },
        { status: 400 }
      );
    }

    // Update credential value if provided
    if (value) {
      await updateCredential(session.user.id, id, value);
    }

    // Update credential name if provided
    if (name) {
      const { updateCredentialName } = await import('@/lib/workflows/credentials');
      await updateCredentialName(session.user.id, id, name);
    }

    logger.info(
      { userId: session.user.id, credentialId: id, updatedFields: { name: !!name, value: !!value } },
      'Credential updated'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to update credential');
    return NextResponse.json(
      { error: 'Failed to update credential' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/credentials/[id]
 * Delete a credential
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    await deleteCredential(session.user.id, id);

    logger.info(
      { userId: session.user.id, credentialId: id },
      'Credential deleted'
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete credential');
    return NextResponse.json(
      { error: 'Failed to delete credential' },
      { status: 500 }
    );
  }
}
