import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { removeOrganizationMember, getUserRoleInOrganization } from '@/lib/organizations';
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { organizationMembersTable } from '@/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * DELETE /api/clients/[id]/members/[memberId]
 * Remove a member from the client organization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, memberId } = await params;

    // Verify user has permission (must be owner or admin)
    const userRole = await getUserRoleInOrganization(session.user.id, id);
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can remove members' },
        { status: 403 }
      );
    }

    // Get the member to be removed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [member] = await (db as any)
      .select()
      .from(organizationMembersTable)
      .where(eq(organizationMembersTable.id, memberId))
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Prevent removing the owner
    if (member.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove the organization owner' }, { status: 400 });
    }

    // Remove the member
    await removeOrganizationMember(id, member.userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const { id, memberId } = await params;
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        organizationId: id,
        memberId,
        action: 'client_member_remove_failed'
      },
      'Failed to remove client member'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
