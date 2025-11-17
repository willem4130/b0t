---
name: fix
description: Run typechecking and linting, then spawn parallel agents to fix all issues
---

# Project Code Quality Check

This command runs all linting and typechecking tools for this project, collects errors, groups them by domain, and spawns parallel agents to fix them.

## Step 1: Run Linting and Typechecking

Run the following commands for this Next.js 15 TypeScript project:

```bash
npm run lint
npm run typecheck
```

Capture all output from both commands.

## Step 2: Collect and Parse Errors

Parse the output from the linting and typechecking commands. Group errors by domain:

- **Type errors**: Issues from TypeScript (`tsc --noEmit`)
  - Look for patterns like: `error TS####:`, `src/path/file.ts(line,col):`
  - Extract file path, line number, column, and error message

- **Lint errors**: Issues from ESLint
  - Look for patterns like: `error` or `warning` with file paths
  - Extract file path, line number, rule name, and error message

Create a structured list of all files with issues and the specific problems in each file.

## Step 3: Spawn Parallel Agents

**CRITICAL**: Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

For each domain that has issues, spawn an agent in parallel using the Task tool.

### If there are Type Errors:
Spawn a general-purpose agent to fix TypeScript errors with a prompt containing the full list of type errors.

### If there are Lint Errors:
Spawn a general-purpose agent to fix ESLint errors with a prompt containing the full list of lint errors.

Each agent should:
1. Receive the list of files and specific errors in their domain
2. Fix all errors in their domain
3. Run the relevant check command to verify fixes
4. Report completion

## Step 4: Verify All Fixes

After all agents complete, run the full check again to ensure all issues are resolved:

```bash
npm run lint && npm run typecheck
```

Report the final status and any remaining issues.
