#!/usr/bin/env tsx
/**
 * Create Workflow Script
 *
 * Create a new workflow file with proper structure and metadata.
 * Eliminates manual JSON writing for workflow initialization.
 *
 * Usage:
 *   npx tsx scripts/create-workflow.ts <name> [options]
 *   npx tsx scripts/create-workflow.ts "My Test Workflow" \
 *     --trigger manual \
 *     --description "Test workflow for utilities" \
 *     --output-type json \
 *     --file workflow/my-test.json
 *
 * Features:
 *   - Creates workflow directory if needed
 *   - Generates proper base structure
 *   - Validates trigger type
 *   - Auto-generates filename from name
 *   - Sets up empty steps array ready for add-workflow-step.ts
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

interface WorkflowConfig {
  name: string;
  description?: string;
  trigger: {
    type: 'manual' | 'cron' | 'webhook' | 'telegram' | 'discord' | 'chat' | 'chat-input';
    config: Record<string, unknown>;
  };
  version: string;
  config: {
    timeout: number;
    retries: number;
    steps: unknown[];
    outputDisplay?: {
      type: 'json' | 'table' | 'list' | 'text' | 'markdown' | 'image' | 'images' | 'chart';
      columns?: string[];
    };
  };
  metadata?: {
    category?: string;
    tags?: string[];
  };
}

interface Args {
  name: string;
  description?: string;
  triggerType: 'manual' | 'cron' | 'webhook' | 'telegram' | 'discord' | 'chat' | 'chat-input';
  outputType: 'json' | 'table' | 'list' | 'text' | 'markdown' | 'image' | 'images' | 'chart';
  outputColumns?: string[];
  category?: string;
  tags?: string[];
  file?: string;
  timeout?: number;
  retries?: number;
}

/**
 * Generate filename from workflow name
 */
function generateFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create workflow configuration
 */
function createWorkflowConfig(args: Args): WorkflowConfig {
  const config: WorkflowConfig = {
    version: '1.0',
    name: args.name,
    description: args.description || `Workflow: ${args.name}`,
    trigger: {
      type: args.triggerType,
      config: {},
    },
    config: {
      timeout: args.timeout || 300000,
      retries: args.retries || 0,
      steps: [],
      outputDisplay: {
        type: args.outputType,
      },
    },
  };

  // Add columns for table output
  if (args.outputType === 'table' && args.outputColumns) {
    config.config.outputDisplay!.columns = args.outputColumns;
  }

  // Add metadata if provided
  if (args.category || args.tags) {
    config.metadata = {};
    if (args.category) config.metadata.category = args.category;
    if (args.tags) config.metadata.tags = args.tags;
  }

  return config;
}

/**
 * Create workflow file
 */
function createWorkflow(args: Args): { success: boolean; message: string; file?: string } {
  try {
    // Determine file path
    let filePath: string;
    if (args.file) {
      filePath = resolve(process.cwd(), args.file);
    } else {
      const filename = generateFilename(args.name);
      filePath = resolve(process.cwd(), 'workflow', `${filename}.json`);
    }

    // Check if file already exists
    if (existsSync(filePath)) {
      return {
        success: false,
        message: `Workflow file already exists: ${filePath}`,
      };
    }

    // Create directory if needed
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }

    // Create workflow config
    const config = createWorkflowConfig(args);

    // Write file
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');

    console.log(`\n✅ Workflow created successfully!`);
    console.log(`   Name: ${args.name}`);
    console.log(`   Trigger: ${args.triggerType}`);
    console.log(`   Output: ${args.outputType}`);
    console.log(`   File: ${filePath}`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Add steps with: npx tsx scripts/add-workflow-step.ts ${filePath} --module <path> --id <id> --inputs '<json>'`);
    console.log(`   2. Validate with: npm run validate ${filePath}`);
    console.log(`   3. Import with: npx tsx scripts/import-workflow.ts ${filePath}`);

    return {
      success: true,
      message: 'Workflow created successfully',
      file: filePath,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): Args | null {
  if (argv.length < 1 || argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Create Workflow - Generate base workflow structure

Usage:
  npx tsx scripts/create-workflow.ts <name> [options]

Required:
  <name>                  Workflow name (quoted if contains spaces)

Optional:
  --description <text>    Workflow description
  --trigger <type>        Trigger type: manual, cron, webhook, chat (default: manual)
  --output-type <type>    Output type: json, table, text (default: json)
  --output-columns <cols> Columns for table output (comma-separated)
  --category <cat>        Workflow category
  --tags <tags>           Comma-separated tags
  --file <path>           Custom file path (default: workflow/<slug>.json)
  --timeout <ms>          Timeout in milliseconds (default: 300000)
  --retries <n>           Number of retries (default: 0)

Examples:
  # Basic workflow
  npx tsx scripts/create-workflow.ts "Test Workflow"

  # With all options
  npx tsx scripts/create-workflow.ts "Social Media Bot" \\
    --description "Automated Twitter replies" \\
    --trigger cron \\
    --output-type table \\
    --output-columns "id,text,author" \\
    --category "social" \\
    --tags "twitter,automation"

  # Custom file location
  npx tsx scripts/create-workflow.ts "My Workflow" \\
    --file workflows/custom/my-workflow.json

  # Chat workflow
  npx tsx scripts/create-workflow.ts "AI Assistant" \\
    --trigger chat \\
    --output-type text

After creation:
  1. Add steps: npx tsx scripts/add-workflow-step.ts <file> --module <path> --id <id> --inputs '<json>'
  2. Validate: npm run validate <file>
  3. Import: npx tsx scripts/import-workflow.ts <file>
    `);
    return null;
  }

  const name = argv[0];
  const descIndex = argv.indexOf('--description');
  const triggerIndex = argv.indexOf('--trigger');
  const outputTypeIndex = argv.indexOf('--output-type');
  const outputColumnsIndex = argv.indexOf('--output-columns');
  const categoryIndex = argv.indexOf('--category');
  const tagsIndex = argv.indexOf('--tags');
  const fileIndex = argv.indexOf('--file');
  const timeoutIndex = argv.indexOf('--timeout');
  const retriesIndex = argv.indexOf('--retries');

  const triggerType = (triggerIndex !== -1 ? argv[triggerIndex + 1] : 'manual') as
    | 'manual'
    | 'cron'
    | 'webhook'
    | 'telegram'
    | 'discord'
    | 'chat'
    | 'chat-input';
  const outputType = (outputTypeIndex !== -1 ? argv[outputTypeIndex + 1] : 'json') as
    | 'json'
    | 'table'
    | 'list'
    | 'text'
    | 'markdown'
    | 'image'
    | 'images'
    | 'chart';

  // Validate trigger type
  const validTriggers = ['manual', 'cron', 'webhook', 'telegram', 'discord', 'chat', 'chat-input'];
  if (!validTriggers.includes(triggerType)) {
    console.error(`❌ Error: Invalid trigger type "${triggerType}"`);
    console.error(`   Valid types: ${validTriggers.join(', ')}\n`);
    return null;
  }

  // Validate output type
  const validOutputs = ['json', 'table', 'list', 'text', 'markdown', 'image', 'images', 'chart'];
  if (!validOutputs.includes(outputType)) {
    console.error(`❌ Error: Invalid output type "${outputType}"`);
    console.error(`   Valid types: ${validOutputs.join(', ')}\n`);
    return null;
  }

  return {
    name,
    description: descIndex !== -1 ? argv[descIndex + 1] : undefined,
    triggerType,
    outputType,
    outputColumns:
      outputColumnsIndex !== -1 ? argv[outputColumnsIndex + 1].split(',').map(s => s.trim()) : undefined,
    category: categoryIndex !== -1 ? argv[categoryIndex + 1] : undefined,
    tags: tagsIndex !== -1 ? argv[tagsIndex + 1].split(',').map(s => s.trim()) : undefined,
    file: fileIndex !== -1 ? argv[fileIndex + 1] : undefined,
    timeout: timeoutIndex !== -1 ? parseInt(argv[timeoutIndex + 1]) : undefined,
    retries: retriesIndex !== -1 ? parseInt(argv[retriesIndex + 1]) : undefined,
  };
}

// Main execution
const args = parseArgs(process.argv.slice(2));

if (args) {
  const result = createWorkflow(args);

  if (!result.success) {
    console.error(`\n❌ Error: ${result.message}\n`);
    process.exit(1);
  }

  process.exit(0);
}
