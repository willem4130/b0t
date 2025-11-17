# Workflows

Multi-step automation pipelines for social media tasks.

## Structure

```
workflows/
├── Pipeline.ts              # Core pipeline orchestration class
├── twitter/
│   ├── reply-to-tweets.ts   # Reply to tweets automation
│   └── post-tweets.ts       # Post tweets automation
├── youtube/
│   └── reply-to-comments.ts # Reply to YouTube comments
└── instagram/
    ├── reply-to-comments.ts # Reply to IG comments
    └── reply-to-dms.ts      # Reply to IG DMs
```

## How It Works

Each workflow is a **multi-step pipeline** that:
1. Executes steps sequentially
2. Passes data from step to step
3. Logs each step with Pino
4. Stops on first error
5. Returns detailed results

## Example Usage

```typescript
import { replyToTweetsWorkflow } from '@/lib/workflows/twitter/reply-to-tweets';

// Run the workflow
const result = await replyToTweetsWorkflow();

// Check results
if (result.success) {
  console.log('✅ All steps completed');
  console.log(result.finalData);
} else {
  console.log('❌ Workflow failed');
  console.log(result.results); // See which step failed
}
```

## Creating a New Workflow

```typescript
import { createPipeline } from './Pipeline';

export async function myWorkflow() {
  return await createPipeline({})
    .step('step-1', async (ctx) => {
      // Do something
      return { ...ctx, data: 'result' };
    })
    .step('step-2', async (ctx) => {
      // Use ctx.data from step 1
      return { ...ctx, moreData: 'more' };
    })
    .execute({});
}
```

## Pipeline Features

### Sequential Execution
Steps run in order, one at a time.

### Data Flow
```typescript
.step('search', async () => ({ tweets: [...] }))
.step('filter', async (ctx) => {
  // ctx.tweets is available from previous step
  return { ...ctx, filtered: ctx.tweets.filter(...) };
})
```

### Error Handling
```typescript
// Stop on first error (default)
await pipeline.execute({});

// Continue on error
await pipeline.execute({}, { continueOnError: true });
```

### Logging
```typescript
// Enable detailed result logging
await pipeline.execute({}, { logResults: true });
```

## Current Workflows (Templates)

All workflows are **stubbed** - they have the structure but need implementation:

### Twitter
- `reply-to-tweets.ts` - Search tweets → Rank → Generate reply → Post
- `post-tweets.ts` - Generate tweet → Validate → Post → Save

### YouTube
- `reply-to-comments.ts` - Fetch comments → Filter → Generate reply → Post

### Instagram
- `reply-to-comments.ts` - Fetch comments → Filter → Generate reply → Post
- `reply-to-dms.ts` - Fetch DMs → Filter → Generate reply → Send

## Next Steps

1. Implement TODO sections in each workflow
2. Add error handling for API failures
3. Add database saves for tracking
4. Test each step individually
5. Add to scheduled jobs in `src/lib/jobs/index.ts`

## Testing

```typescript
// Test a workflow manually
import { replyToTweetsWorkflow } from '@/lib/workflows/twitter/reply-to-tweets';

const result = await replyToTweetsWorkflow();
console.log(result.results); // See each step's outcome
```

## Integration with Jobs

```typescript
// In src/lib/jobs/index.ts
import { replyToTweetsWorkflow } from '@/lib/workflows/twitter/reply-to-tweets';

const jobs: ScheduledJob[] = [
  {
    name: 'twitter-reply-tweets',
    schedule: '*/15 * * * *',
    task: replyToTweetsWorkflow, // Just reference the workflow
    enabled: true,
  },
];
```

## Logs

Pipeline automatically logs:
- Pipeline start
- Each step start
- Each step completion (with duration)
- Errors with context
- Final results

All logs go through Pino logger for structured output.
