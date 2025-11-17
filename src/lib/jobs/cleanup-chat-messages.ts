import { db } from '@/lib/db';
import { chatMessagesTable, chatConversationsTable } from '@/lib/schema';
import { lt, and, eq, sql, inArray } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Clean up old chat messages and inactive conversations
 *
 * Retention policy:
 * - Active conversations: Keep last 100 messages per conversation
 * - Inactive conversations (90+ days): Archive or delete
 *
 * This prevents unbounded growth from AI chat interactions.
 *
 * Schedule: Daily at 3 AM
 */
export async function cleanupChatMessages(): Promise<void> {
  try {
    let totalMessagesDeleted = 0;
    let totalConversationsArchived = 0;

    // 1. Clean up old messages in active conversations (keep last 100 per conversation)
    const conversations = await db
      .select({ id: chatConversationsTable.id })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.status, 'active'));

    for (const conversation of conversations) {
      // Get message IDs to keep (last 100 messages)
      const messagesToKeep = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, conversation.id))
        .orderBy(sql`${chatMessagesTable.createdAt} DESC`)
        .limit(100);

      if (messagesToKeep.length === 100) {
        // If we have more than 100 messages, delete the older ones
        const keepIds = messagesToKeep.map((m) => m.id);

        const result = await db
          .delete(chatMessagesTable)
          .where(
            and(
              eq(chatMessagesTable.conversationId, conversation.id),
              sql`${chatMessagesTable.id} NOT IN (${sql.join(keepIds.map(id => sql`${id}`), sql`, `)})`
            )
          );

        totalMessagesDeleted += result.rowCount || 0;
      }
    }

    // 2. Archive inactive conversations (no updates in 90+ days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const archiveResult = await db
      .update(chatConversationsTable)
      .set({ status: 'archived' })
      .where(
        and(
          eq(chatConversationsTable.status, 'active'),
          lt(chatConversationsTable.updatedAt, ninetyDaysAgo)
        )
      );

    totalConversationsArchived = archiveResult.rowCount || 0;

    // 3. Delete messages from conversations archived more than 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const archivedConversations = await db
      .select({ id: chatConversationsTable.id })
      .from(chatConversationsTable)
      .where(
        and(
          eq(chatConversationsTable.status, 'archived'),
          lt(chatConversationsTable.updatedAt, thirtyDaysAgo)
        )
      );

    if (archivedConversations.length > 0) {
      const archivedIds = archivedConversations.map((c) => c.id);

      const archivedMessagesResult = await db
        .delete(chatMessagesTable)
        .where(inArray(chatMessagesTable.conversationId, archivedIds));

      totalMessagesDeleted += archivedMessagesResult.rowCount || 0;
    }

    if (totalMessagesDeleted > 0 || totalConversationsArchived > 0) {
      logger.info(
        {
          messagesDeleted: totalMessagesDeleted,
          conversationsArchived: totalConversationsArchived,
          archivedConversationsWithDeletedMessages: archivedConversations.length,
        },
        'Cleaned up chat messages and archived conversations'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup chat messages');
    throw error;
  }
}
