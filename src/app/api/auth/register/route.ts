import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { usersTable, invitationsTable, organizationMembersTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { logger } from '@/lib/logger';
import { checkStrictRateLimit } from '@/lib/ratelimit';

/**
 * POST /api/auth/register
 * Register a new user via invitation token
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting (3 requests per minute) to prevent registration abuse
  const rateLimitResult = await checkStrictRateLimit(request);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json();
    const { token, email, password, name } = body;

    // Validate input
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Find invitation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [invitation] = await (db as any)
      .select()
      .from(invitationsTable)
      .where(
        and(
          eq(invitationsTable.token, token),
          eq(invitationsTable.email, email)
        )
      )
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid invitation token or email' }, { status: 404 });
    }

    // Check if invitation is expired
    if (new Date() > new Date(invitation.expiresAt)) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    // Check if invitation was already accepted
    if (invitation.acceptedAt) {
      return NextResponse.json({ error: 'Invitation has already been used' }, { status: 400 });
    }

    // Check if user already exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [existingUser] = await (db as any)
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 400 });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = nanoid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).insert(usersTable).values({
      id: userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name || null,
      emailVerified: true, // Consider them verified since they used the invitation
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add user to organization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).insert(organizationMembersTable).values({
      id: nanoid(),
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      joinedAt: new Date(),
    });

    // Mark invitation as accepted
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)
      .update(invitationsTable)
      .set({ acceptedAt: new Date() })
      .where(eq(invitationsTable.id, invitation.id));

    logger.info(
      { userId, email: email.toLowerCase(), organizationId: invitation.organizationId, action: 'user_register_success' },
      'User registered successfully'
    );

    return NextResponse.json({
      success: true,
      message: 'Account created successfully. You can now sign in.',
    });
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), action: 'user_register_failed' },
      'Failed to register user'
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
