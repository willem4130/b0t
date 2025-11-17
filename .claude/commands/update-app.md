---
name: update-app
description: Update dependencies, fix deprecations and warnings
---

# Dependency Update & Deprecation Fix

## Step 1: Check for Updates

```bash
npm outdated
```

Review the output to see which packages have available updates.

## Step 2: Update Dependencies

```bash
npm update
npm audit fix
```

If there are security vulnerabilities that require breaking changes:
```bash
npm audit fix --force
```
(Use with caution - verify changes afterward)

## Step 3: Check for Deprecations & Warnings

Run a clean installation and check output:
```bash
rm -rf node_modules package-lock.json
npm install
```

Read ALL output carefully. Look for:
- Deprecation warnings
- Security vulnerabilities
- Peer dependency warnings
- Breaking changes in dependencies
- npm WARN messages

## Step 4: Fix Issues

For each warning/deprecation:
1. Research the recommended replacement or fix
2. Update code/dependencies accordingly
3. Re-run installation
4. Verify no warnings remain

Common fixes:
- Update deprecated API usage in code
- Add missing peer dependencies
- Resolve version conflicts
- Update deprecated package.json scripts

## Step 5: Run Quality Checks

```bash
npm run lint
npx tsc --noEmit
```

Fix all errors before continuing. This is MANDATORY per project guidelines.

If changes affect runtime behavior, restart dev server:
```bash
npm run dev
```

Read server output for additional warnings.

## Step 6: Verify Clean Install

Ensure a fresh install works without warnings:
```bash
rm -rf node_modules package-lock.json
npm install
```

Verify:
- ZERO warnings/errors in install output
- All dependencies resolve correctly
- No deprecation messages
- No security vulnerabilities
- Dev server starts cleanly

## Step 7: Test Application

Start the dev server and verify functionality:
```bash
npm run dev
```

Check critical flows:
- Authentication (NextAuth.js + Twitter OAuth)
- Database operations (Drizzle ORM)
- Job scheduling (BullMQ, node-cron)
- API endpoints (/api/*)
- UI components render correctly

## Completion Checklist

- [ ] All dependencies updated
- [ ] Security vulnerabilities resolved
- [ ] Zero deprecation warnings
- [ ] Zero install warnings
- [ ] Linting passes: `npm run lint`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Dev server starts without errors
- [ ] Core functionality verified
