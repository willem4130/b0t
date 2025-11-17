import { streamText, type Tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { logger } from '@/lib/logger';
import { generateToolsFromModules, type ToolGenerationOptions } from './ai-tools';

/**
 * AI Agent Stream Module - Streaming Tool-Using AI
 *
 * Enhanced agent with streaming support and step-by-step tracking.
 * Provides real-time visibility into agent reasoning and tool execution.
 *
 * Features:
 * - Real-time streaming of agent responses
 * - Step-by-step tool call tracking
 * - Progress callbacks for UI updates
 * - Full execution trace with tool results
 * - Same tool ecosystem as base agent (1282+ tools)
 *
 * Perfect for:
 * - Interactive chat interfaces
 * - Long-running agent tasks with progress updates
 * - Debugging agent behavior
 * - Building responsive UIs
 */

export type AIProvider = 'openai' | 'anthropic';
export type AIModel = string;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCallStep {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  timestamp: Date;
}

export interface ToolResultStep {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
  timestamp: Date;
}

export interface TextDeltaStep {
  type: 'text-delta';
  textDelta: string;
  timestamp: Date;
}

export interface FinishStep {
  type: 'finish';
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: Date;
}

export type AgentStep = ToolCallStep | ToolResultStep | TextDeltaStep | FinishStep;

export interface StreamAgentOptions {
  /**
   * The user's input/goal for the agent
   */
  prompt: string;

  /**
   * System prompt defining agent's role and behavior
   */
  systemPrompt?: string;

  /**
   * AI model to use (default: claude-3-5-sonnet-20241022)
   */
  model?: AIModel;

  /**
   * AI provider (default: auto-detected from model)
   */
  provider?: AIProvider;

  /**
   * Maximum number of reasoning/tool-use steps (default: 10)
   */
  maxSteps?: number;

  /**
   * Temperature for generation (default: 0.7)
   */
  temperature?: number;

  /**
   * Conversation history (for multi-turn conversations)
   */
  conversationHistory?: AIMessage[];

  /**
   * Tool generation options (categories, modules, etc.)
   */
  toolOptions?: ToolGenerationOptions;

  /**
   * Custom tools to include (merged with auto-generated tools)
   */
  customTools?: Record<string, Tool>;

  /**
   * API key for the AI provider
   */
  apiKey?: string;

  /**
   * Callback for each step (tool call, result, text delta, etc.)
   */
  onStep?: (step: AgentStep) => void | Promise<void>;

  /**
   * Callback for text deltas (for real-time UI updates)
   */
  onTextDelta?: (delta: string) => void | Promise<void>;

  /**
   * Callback when agent finishes
   */
  onFinish?: (result: {
    text: string;
    steps: AgentStep[];
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }) => void | Promise<void>;
}

/**
 * Get the AI model instance based on provider and model name
 */
function getModelInstance(provider: AIProvider, modelName: string, apiKey?: string) {
  if (provider === 'openai') {
    if (!apiKey) {
      throw new Error(
        'OpenAI API key not found. Please add an OpenAI API key in the credentials page.'
      );
    }
    const openaiProvider = createOpenAI({
      apiKey: apiKey,
    });
    return openaiProvider(modelName);
  } else if (provider === 'anthropic') {
    if (!apiKey) {
      throw new Error(
        'Anthropic API key not found. Please add an Anthropic API key in the credentials page.'
      );
    }
    const anthropicProvider = createAnthropic({
      apiKey: apiKey,
    });
    return anthropicProvider(modelName);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Detect provider from model name
 */
function detectProvider(model?: string): AIProvider {
  if (!model) return 'anthropic'; // Default to Claude for agents

  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
    return 'openai';
  }

  if (model.startsWith('claude-')) {
    return 'anthropic';
  }

  return 'anthropic'; // Default to Claude
}

/**
 * Stream an AI agent with step-by-step tracking
 * Returns an async generator that yields text deltas and steps
 */
export async function* streamAgent(
  options: StreamAgentOptions
): AsyncGenerator<AgentStep | { type: 'text'; text: string }> {
  const {
    prompt,
    systemPrompt = 'You are a helpful AI assistant with access to various tools. Use tools when needed to accomplish tasks.',
    model = 'claude-3-5-sonnet-20241022',
    provider: explicitProvider,
    maxSteps = 10,
    temperature = 0.7,
    conversationHistory = [],
    toolOptions = {},
    customTools = {},
    apiKey,
    onStep,
    onTextDelta,
    onFinish,
  } = options;

  const provider = explicitProvider || detectProvider(model);

  logger.info(
    {
      model,
      provider,
      maxSteps,
      promptLength: prompt.length,
      hasHistory: conversationHistory.length > 0,
      toolCategories: toolOptions.categories,
    },
    'Starting streaming AI agent'
  );

  // Generate tools from module registry
  const autoGeneratedTools = generateToolsFromModules(toolOptions);
  const allTools = { ...autoGeneratedTools, ...customTools };
  const toolCount = Object.keys(allTools).length;

  logger.info(
    {
      autoGeneratedToolCount: Object.keys(autoGeneratedTools).length,
      customToolCount: Object.keys(customTools).length,
      totalToolCount: toolCount,
    },
    'Tools loaded for streaming agent'
  );

  // Build messages array
  const messages = [
    ...conversationHistory.filter((m) => m.role !== 'system'),
    { role: 'user' as const, content: prompt },
  ];

  // Get system prompt (prefer from conversation history if present)
  const systemMessage = conversationHistory.find((m) => m.role === 'system');
  const finalSystemPrompt = systemMessage?.content || systemPrompt;

  // Get model instance
  const modelInstance = getModelInstance(provider, model, apiKey);

  // Track all steps
  const allSteps: AgentStep[] = [];
  let fullText = '';
  let currentStepCount = 0;

  // Execute agent with streaming
  const result = streamText({
    model: modelInstance,
    messages,
    system: finalSystemPrompt,
    tools: allTools,
    temperature,
    onStepFinish: async ({ text, toolCalls, toolResults, finishReason, usage }) => {
      currentStepCount++;

      logger.info(
        {
          stepNumber: currentStepCount,
          hasText: !!text,
          toolCallCount: toolCalls?.length || 0,
          toolResultCount: toolResults?.length || 0,
          finishReason,
        },
        'Agent step finished'
      );

      // Track tool calls
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const step: ToolCallStep = {
            type: 'tool-call',
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: 'input' in toolCall ? toolCall.input : ('args' in toolCall ? (toolCall as unknown as { args: unknown }).args : undefined),
            timestamp: new Date(),
          };
          allSteps.push(step);

          if (onStep) {
            await onStep(step);
          }
        }
      }

      // Track tool results
      if (toolResults && toolResults.length > 0) {
        for (const toolResult of toolResults) {
          const step: ToolResultStep = {
            type: 'tool-result',
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            output: 'output' in toolResult ? toolResult.output : ('result' in toolResult ? (toolResult as unknown as { result: unknown }).result : undefined),
            timestamp: new Date(),
          };
          allSteps.push(step);

          if (onStep) {
            await onStep(step);
          }
        }
      }

      // Track finish
      if (finishReason && usage) {
        const step: FinishStep = {
          type: 'finish',
          finishReason,
          usage: {
            promptTokens: usage.inputTokens || 0,
            completionTokens: usage.outputTokens || 0,
            totalTokens: usage.totalTokens || 0,
          },
          timestamp: new Date(),
        };
        allSteps.push(step);

        if (onStep) {
          await onStep(step);
        }

        if (onFinish) {
          await onFinish({
            text: fullText,
            steps: allSteps,
            usage: {
              promptTokens: usage.inputTokens || 0,
              completionTokens: usage.outputTokens || 0,
              totalTokens: usage.totalTokens || 0,
            },
          });
        }
      }
    },
  });

  // Stream text deltas
  for await (const chunk of result.textStream) {
    fullText += chunk;

    const step: TextDeltaStep = {
      type: 'text-delta',
      textDelta: chunk,
      timestamp: new Date(),
    };

    allSteps.push(step);

    if (onTextDelta) {
      await onTextDelta(chunk);
    }

    if (onStep) {
      await onStep(step);
    }

    yield step;
  }

  // Yield final text
  yield { type: 'text' as const, text: fullText };

  logger.info(
    {
      model,
      provider,
      totalSteps: allSteps.length,
      textLength: fullText.length,
      stepCount: currentStepCount,
    },
    'Streaming agent completed'
  );
}

/**
 * Convenience function: Stream agent and collect full response
 * Use this when you want streaming but also need the final result
 */
export async function runStreamingAgent(
  options: StreamAgentOptions
): Promise<{
  text: string;
  steps: AgentStep[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  let finalText = '';
  const steps: AgentStep[] = [];
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

  for await (const chunk of streamAgent(options)) {
    if (chunk.type === 'text') {
      finalText = chunk.text;
    } else if (chunk.type === 'finish') {
      usage = chunk.usage;
    }

    if ('timestamp' in chunk) {
      steps.push(chunk as AgentStep);
    }
  }

  return { text: finalText, steps, usage };
}

/**
 * Convenience function: Stream social media agent
 */
export async function* streamSocialAgent(
  prompt: string,
  credentials?: Record<string, string>,
  onStep?: (step: AgentStep) => void | Promise<void>
): AsyncGenerator<AgentStep | { type: 'text'; text: string }> {
  yield* streamAgent({
    prompt,
    systemPrompt:
      'You are a social media management assistant. You can help with posting, searching, and analyzing social media content across platforms like Twitter, Reddit, Discord, and more.',
    toolOptions: {
      categories: ['social', 'communication'],
      credentials,
    },
    onStep,
  });
}

/**
 * Convenience function: Stream communication agent
 */
export async function* streamCommunicationAgent(
  prompt: string,
  credentials?: Record<string, string>,
  onStep?: (step: AgentStep) => void | Promise<void>
): AsyncGenerator<AgentStep | { type: 'text'; text: string }> {
  yield* streamAgent({
    prompt,
    systemPrompt:
      'You are a communication assistant. You can help with sending emails, messages, notifications, and managing communication across various platforms.',
    toolOptions: {
      categories: ['communication', 'productivity'],
      credentials,
    },
    onStep,
  });
}

/**
 * Convenience function: Stream data agent
 */
export async function* streamDataAgent(
  prompt: string,
  credentials?: Record<string, string>,
  onStep?: (step: AgentStep) => void | Promise<void>
): AsyncGenerator<AgentStep | { type: 'text'; text: string }> {
  yield* streamAgent({
    prompt,
    systemPrompt:
      'You are a data analysis assistant. You can help with data processing, database queries, spreadsheet operations, and generating insights from data.',
    toolOptions: {
      categories: ['data', 'dataprocessing', 'utilities'],
      credentials,
    },
    onStep,
  });
}
