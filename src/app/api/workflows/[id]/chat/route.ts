import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { db } from '@/lib/db';
import { workflowsTable, chatConversationsTable, chatMessagesTable } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';
import { executeWorkflowConfig } from '@/lib/workflows/executor';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Chat AI configuration (can be overridden via env vars)
const CHAT_AI_PROVIDER = (process.env.CHAT_AI_PROVIDER || 'openai') as 'openai' | 'anthropic';
const CHAT_AI_MODEL = process.env.CHAT_AI_MODEL || (CHAT_AI_PROVIDER === 'openai' ? 'gpt-4-turbo' : 'claude-3-5-sonnet-20241022');

/**
 * GET /api/workflows/[id]/chat?conversationId=xxx
 * Get messages for a specific conversation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (!conversationId) {
      return new Response('conversationId is required', { status: 400 });
    }

    // Verify workflow ownership first
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, workflowId),
          eq(workflowsTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (workflows.length === 0) {
      return new Response('Workflow not found or access denied', { status: 404 });
    }

    // Fetch conversation
    const conversations = await db
      .select()
      .from(chatConversationsTable)
      .where(
        and(
          eq(chatConversationsTable.id, conversationId),
          eq(chatConversationsTable.workflowId, workflowId)
        )
      )
      .limit(1);

    if (conversations.length === 0) {
      return new Response('Conversation not found', { status: 404 });
    }

    // Fetch messages
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, conversationId))
      .orderBy(chatMessagesTable.createdAt)
      .limit(20); // Last 20 messages per user requirement

    return Response.json({
      conversation: conversations[0],
      messages,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ workflowId, conversationId, error: errorMessage }, 'Failed to fetch conversation');
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * POST /api/workflows/[id]/chat
 * Chat with AI to execute workflow with natural language
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workflowId } = await params;
  try {
    // Verify authentication
    const session = await auth();
    if (!session?.user?.id) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages, conversationId } = await request.json();

    logger.info({ workflowId, conversationId }, 'Chat request received');

    // Fetch workflow with ownership verification
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.id, workflowId),
          eq(workflowsTable.userId, session.user.id)
        )
      )
      .limit(1);

    if (workflows.length === 0) {
      logger.warn({ workflowId, userId: session.user.id }, 'Workflow not found or access denied');
      return new Response('Workflow not found or access denied', { status: 404 });
    }

    const workflow = workflows[0];

    // Get or create conversation
    let conversation;
    if (conversationId) {
      const existingConv = await db
        .select()
        .from(chatConversationsTable)
        .where(
          and(
            eq(chatConversationsTable.id, conversationId),
            eq(chatConversationsTable.workflowId, workflowId)
          )
        )
        .limit(1);

      conversation = existingConv[0];
    }

    if (!conversation) {
      // Create new conversation
      const convId = nanoid();
      await db.insert(chatConversationsTable).values({
        id: convId,
        workflowId,
        userId: workflow.userId,
        organizationId: workflow.organizationId,
        title: null,
        status: 'active',
        messageCount: 0,
      });

      const newConv = await db
        .select()
        .from(chatConversationsTable)
        .where(eq(chatConversationsTable.id, convId))
        .limit(1);

      conversation = newConv[0];
      logger.info({ conversationId: convId, workflowId }, 'Created new conversation');
    }
    const config = typeof workflow.config === 'string'
      ? JSON.parse(workflow.config)
      : workflow.config;

    // Check if this is an agent workflow (uses ai-agent modules)
    const isAgentWorkflow = config.steps?.some((step: { module: string }) =>
      step.module?.startsWith('ai.ai-agent')
    );

    // Extract model and provider from workflow config (if available in first step)
    // For agent workflows, model is in inputs.options.model
    const firstStepInputs = config.steps?.[0]?.inputs;
    const workflowModel = firstStepInputs?.options?.model || firstStepInputs?.model || CHAT_AI_MODEL;
    const workflowProvider = firstStepInputs?.options?.provider || firstStepInputs?.provider || CHAT_AI_PROVIDER;

    // Get the last user message - handle both content and parts format
    const lastMessage = messages[messages.length - 1];
    let userInput = '';
    if (lastMessage?.content) {
      userInput = typeof lastMessage.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage.content);
    } else if (lastMessage?.parts) {
      // Handle parts format
      const textParts = (lastMessage.parts as Array<{ type: string; text?: string }>)
        .filter((part) => part.type === 'text')
        .map((part) => part.text || '');
      userInput = textParts.join(' ');
    }

    logger.info({ workflowId, messageCount: messages.length, isAgentWorkflow }, 'Starting chat stream');

    // For agent workflows, execute the workflow directly and return its response
    if (isAgentWorkflow) {
      try {
        // Load conversation history from database
        const historyMessages = await db
          .select()
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.conversationId, conversation.id))
          .orderBy(chatMessagesTable.createdAt)
          .limit(20); // Last 20 messages

        // Convert DB messages to AI SDK format
        const conversationHistory = historyMessages.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        }));

        // Inject conversation history into the agent's options
        // Find the agent step and inject conversationHistory
        const modifiedConfig = JSON.parse(JSON.stringify(config)); // Deep clone
        for (const step of modifiedConfig.steps || []) {
          if (step.module?.startsWith('ai.ai-agent')) {
            // Inject conversationHistory into the agent's options
            if (!step.inputs.options) {
              step.inputs.options = {};
            }
            step.inputs.options.conversationHistory = conversationHistory;
            logger.info(
              {
                workflowId,
                conversationId: conversation.id,
                historyLength: conversationHistory.length,
              },
              'Injected conversation history into agent'
            );
          }
        }

        // Execute the agent workflow with modified config
        const workflowResult = await executeWorkflowConfig(modifiedConfig, workflow.userId, {
          userMessage: userInput,
        });

        if (!workflowResult.success) {
          throw new Error(workflowResult.error || 'Workflow execution failed');
        }

        // Extract the agent response and tool calls from workflow output
        // The output structure is: { user: {...}, trigger: {...}, agentResponse: {...} }
        const rawOutput = workflowResult.output as Record<string, unknown> | string;
        let agentResponse: { text?: string; toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }> } | undefined;

        if (typeof rawOutput === 'object' && rawOutput !== null && 'agentResponse' in rawOutput) {
          // Extract agentResponse from workflow context
          agentResponse = rawOutput.agentResponse as { text?: string; toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }> };
        } else if (typeof rawOutput === 'string') {
          // If it's already a string, use it directly
          agentResponse = { text: rawOutput };
        } else {
          // Fallback: treat entire output as agent response
          agentResponse = rawOutput as { text?: string; toolCalls?: Array<{ name: string; args: Record<string, unknown>; result: unknown }> };
        }

        const agentText = agentResponse?.text || '';
        const toolCalls = agentResponse?.toolCalls || [];

        // If there's no text but there are tool calls, it means the agent made tool calls
        // but hasn't generated the final response yet (shouldn't happen with maxSteps > 1)
        if (!agentText && toolCalls.length > 0) {
          logger.warn({ workflowId, toolCalls }, 'Agent completed with tool calls but no text');
        }

        // Save messages to database
        await db.insert(chatMessagesTable).values([
          {
            id: nanoid(),
            conversationId: conversation.id,
            role: 'user',
            content: userInput,
          },
          {
            id: nanoid(),
            conversationId: conversation.id,
            role: 'assistant',
            content: agentText,
          },
        ]);

        // Update conversation
        let title = conversation.title;
        if (!title && userInput) {
          title = userInput.slice(0, 100);
        }

        await db
          .update(chatConversationsTable)
          .set({
            messageCount: conversation.messageCount + 2,
            title,
            updatedAt: new Date(),
          })
          .where(eq(chatConversationsTable.id, conversation.id));

        logger.info({ workflowId, toolCallCount: toolCalls.length }, 'Agent workflow executed successfully');

        // Return agent response with tool call metadata
        logger.info({ workflowId, agentText, toolCallCount: toolCalls.length }, 'Returning agent response');

        // If no text was generated, return an error message
        const finalText = agentText || 'I apologize, but I encountered an issue and could not generate a response.';

        // Create a UI message stream manually with the agent's response
        const stream = createUIMessageStream({
          execute: async ({ writer }) => {
            const textId = 'agent-response';
            // Write the agent's text as the message content
            writer.write({ type: 'text-start', id: textId });
            writer.write({ type: 'text-delta', id: textId, delta: finalText });
            writer.write({ type: 'text-end', id: textId });
            writer.write({ type: 'finish' });
          },
        });

        const response = createUIMessageStreamResponse({ stream });
        // Add conversation ID to response headers
        response.headers.set('X-Conversation-Id', conversation.id);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ workflowId, error: errorMessage }, 'Agent workflow execution failed');

        // Save error message to database
        await db.insert(chatMessagesTable).values([
          {
            id: nanoid(),
            conversationId: conversation.id,
            role: 'user',
            content: userInput,
          },
          {
            id: nanoid(),
            conversationId: conversation.id,
            role: 'assistant',
            content: `I encountered an error: ${errorMessage}`,
          },
        ]);

        return new Response(
          JSON.stringify({
            role: 'assistant',
            content: `I encountered an error: ${errorMessage}`,
            error: errorMessage,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
            status: 500,
          }
        );
      }
    }

    // System prompt for non-agent workflows
    const systemPrompt = `You are a helpful AI assistant that executes workflows based on user input.

Workflow: ${workflow.name}
Description: ${workflow.description || 'No description'}

Your job is to:
1. Understand the user's request
2. Execute the workflow with appropriate parameters
3. Present the results in a clear, conversational way

Be friendly, concise, and helpful. If the workflow produces data, explain it clearly to the user.

IMPORTANT: When formatting tables, always use proper markdown table syntax:
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

Never use ASCII art tables with + and - characters. Always use the | and - markdown table format.`;

    // Convert messages from parts format to standard format and filter
    type MessageLike = { role: string; content?: unknown; parts?: Array<{ type: string; text?: string }> };
    const formattedMessages = (messages as MessageLike[])
      .filter((msg) => msg.role === 'user') // Only keep user messages
      .map((msg) => {
        // If already has content field, use it
        if (msg.content) {
          return {
            role: 'user' as const,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          };
        }

        // Convert from parts format to content format
        if (msg.parts) {
          const textContent = msg.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text || '')
            .join('\n');

          return {
            role: 'user' as const,
            content: textContent
          };
        }

        // Fallback
        return {
          role: 'user' as const,
          content: ''
        };
      })
      .filter((msg) => msg.content); // Remove empty messages

    // Get the AI model instance based on provider
    const modelInstance = workflowProvider === 'openai'
      ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(workflowModel)
      : createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(workflowModel);

    // Stream the AI response using AI SDK
    const result = streamText({
      model: modelInstance,
      system: systemPrompt,
      messages: formattedMessages,
      async onFinish({ text }) {
        logger.info({ workflowId, conversationId: conversation.id, responseLength: text.length }, 'AI response completed');

        // Save user message
        await db.insert(chatMessagesTable).values({
          id: nanoid(),
          conversationId: conversation.id,
          role: 'user',
          content: userInput,
        });

        // Save assistant message
        await db.insert(chatMessagesTable).values({
          id: nanoid(),
          conversationId: conversation.id,
          role: 'assistant',
          content: text,
        });

        // Generate title from first user message if not set
        let title = conversation.title;
        if (!title && userInput) {
          title = userInput.slice(0, 100);
        }

        // Update conversation metadata
        await db
          .update(chatConversationsTable)
          .set({
            messageCount: conversation.messageCount + 2,
            title,
            updatedAt: new Date(),
          })
          .where(eq(chatConversationsTable.id, conversation.id));

        // Execute the workflow using the workflow execution engine
        // Pass trigger data correctly - userMessage should be in the trigger object
        try {
          await executeWorkflowConfig(config, workflow.userId, {
            userMessage: userInput,
          });

          logger.info({ workflowId, conversationId: conversation.id }, 'Workflow executed successfully');
        } catch (error) {
          logger.error({ workflowId, conversationId: conversation.id, error }, 'Error executing workflow');
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        workflowId,
        error: errorMessage,
        action: 'workflow_chat_failed'
      },
      'Chat API error'
    );
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
