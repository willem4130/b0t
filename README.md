# b0t Agent Workspace

This directory is used by the b0t Build agent.

## Directory Structure

- `plans/` - YAML workflow plans (examples and agent-created)
- `workflows/` - Generated workflow JSON files (agent creates these)
- `.claude/commands/` - Slash commands (/workflow, /new-module, /agent-builder)
- `.claude/skills/` - AI agent skills (workflow-generator, workflow-builder, agent-generator)

## How It Works

The agent creates workflow plans (YAML) in the plans/ folder, then uses the b0t API
to build and import them directly to your application. No manual setup required.
