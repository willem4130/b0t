'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Loader2, ChevronDown, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export interface ToolCall {
  name: string;
  args: Record<string, JSONValue>;
  result?: JSONValue;
  error?: string;
  status: 'pending' | 'success' | 'error';
}

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  index?: number;
}

export function ToolCallDisplay({ toolCall, index = 0 }: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = {
    pending: {
      icon: Loader2,
      iconClass: 'animate-spin text-blue-500',
      text: 'Running',
      bgClass: 'bg-blue-500/10 border-blue-500/20',
      textClass: 'text-blue-700 dark:text-blue-400',
    },
    success: {
      icon: CheckCircle,
      iconClass: 'text-green-500',
      text: 'Done',
      bgClass: 'bg-green-500/10 border-green-500/20',
      textClass: 'text-green-700 dark:text-green-400',
    },
    error: {
      icon: XCircle,
      iconClass: 'text-red-500',
      text: 'Failed',
      bgClass: 'bg-red-500/10 border-red-500/20',
      textClass: 'text-red-700 dark:text-red-400',
    },
  };

  const config = statusConfig[toolCall.status];
  const StatusIcon = config.icon;

  // Format tool name: "utilities_array_pluck" -> "array pluck"
  const formatToolName = (name: string) => {
    const parts = name.split('_');
    if (parts.length > 1) {
      return parts.slice(1).join(' ');
    }
    return name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  };

  const hasDetails = Object.keys(toolCall.args).length > 0 || toolCall.result || toolCall.error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className={cn(
        'rounded-lg border transition-all',
        config.bgClass,
        'mb-2'
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors',
          hasDetails && 'cursor-pointer hover:bg-black/5 dark:hover:bg-white/5',
          !hasDetails && 'cursor-default'
        )}
      >
        <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={cn('flex-1 text-left', config.textClass)}>
          {formatToolName(toolCall.name)}
        </span>
        <div className="flex items-center gap-1.5">
          <StatusIcon className={cn('w-3.5 h-3.5', config.iconClass)} />
          <span className={cn('text-xs', config.textClass)}>{config.text}</span>
          {hasDetails && (
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          )}
        </div>
      </button>

      {/* Expandable Details */}
      <AnimatePresence>
        {isExpanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-black/5 dark:border-white/5 pt-2">
              {/* Arguments */}
              {Object.keys(toolCall.args).length > 0 ? (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Input
                  </div>
                  <pre className="text-[11px] bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto">
                    {JSON.stringify(toolCall.args, null, 2) ?? '{}'}
                  </pre>
                </div>
              ) : null}

              {/* Result */}
              {toolCall.result && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Output
                  </div>
                  <pre className="text-[11px] bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto">
                    {typeof toolCall.result === 'string'
                      ? toolCall.result
                      : (JSON.stringify(toolCall.result, null, 2) ?? 'No output')}
                  </pre>
                </div>
              )}

              {/* Error */}
              {toolCall.error && (
                <div>
                  <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">
                    Error
                  </div>
                  <pre className="text-[11px] bg-red-500/10 text-red-700 dark:text-red-400 rounded p-2 overflow-x-auto">
                    {toolCall.error}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Container for multiple tool calls
interface ToolCallsContainerProps {
  toolCalls: ToolCall[];
}

export function ToolCallsContainer({ toolCalls }: ToolCallsContainerProps) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="my-3 space-y-1">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
        Tool Calls ({toolCalls.length})
      </div>
      {toolCalls.map((toolCall, index) => (
        <ToolCallDisplay key={`${toolCall.name}-${index}`} toolCall={toolCall} index={index} />
      ))}
    </div>
  );
}
