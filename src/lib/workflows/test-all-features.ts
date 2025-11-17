/**
 * Comprehensive Test Suite for Workflow System
 *
 * Tests:
 * 1. Credentials storage and retrieval
 * 2. String-utils and array-utils modules
 * 3. Conditional logic (if/else)
 * 4. ForEach loops
 * 5. While loops
 * 6. Workflow export/import
 */

import { storeCredential, getCredential, listCredentials, deleteCredential } from './credentials';
import { executeWorkflowConfig } from './executor';
import { exportWorkflow, importWorkflow, validateWorkflowExport } from './import-export';
import type { WorkflowStep } from './control-flow';

const TEST_USER_ID = 'test-user-123';

/**
 * Test 1: Credentials System
 */
async function testCredentials() {
  console.log('\n📦 Test 1: Credentials System');
  console.log('═══════════════════════════════════════');

  try {
    // Store credentials
    const openaiCred = await storeCredential(TEST_USER_ID, {
      platform: 'openai',
      name: 'Test OpenAI Key',
      value: 'sk-test-12345',
      type: 'api_key',
      metadata: { environment: 'test' },
    });

    const stripeCred = await storeCredential(TEST_USER_ID, {
      platform: 'stripe',
      name: 'Test Stripe Key',
      value: 'sk_test_67890',
      type: 'api_key',
    });

    console.log('✓ Stored credentials:', openaiCred.id, stripeCred.id);

    // Retrieve credentials
    const openaiValue = await getCredential(TEST_USER_ID, 'openai');
    const stripeValue = await getCredential(TEST_USER_ID, 'stripe');

    console.log('✓ Retrieved OpenAI:', openaiValue?.slice(0, 10) + '...');
    console.log('✓ Retrieved Stripe:', stripeValue?.slice(0, 10) + '...');

    // List credentials
    const allCreds = await listCredentials(TEST_USER_ID);
    console.log('✓ Listed credentials:', allCreds.length);

    // Cleanup
    await deleteCredential(TEST_USER_ID, openaiCred.id);
    await deleteCredential(TEST_USER_ID, stripeCred.id);
    console.log('✓ Cleaned up test credentials');

    return true;
  } catch (error) {
    console.error('✗ Credentials test failed:', error);
    return false;
  }
}

/**
 * Test 2: String Utils Module
 */
async function testStringUtils() {
  console.log('\n🔤 Test 2: String Utils Module');
  console.log('═══════════════════════════════════════');

  try {
    const workflow = {
      steps: [
        {
          type: 'action',
          id: 'step1',
          module: 'utilities.string-utils.toSlug',
          inputs: { text: 'Hello World! Test 123' },
          outputAs: 'slug',
        },
        {
          type: 'action',
          id: 'step2',
          module: 'utilities.string-utils.truncate',
          inputs: { str: 'This is a very long string that needs truncation', maxLength: 20 },
          outputAs: 'truncated',
        },
      ],
    };

    const result = await executeWorkflowConfig(workflow, TEST_USER_ID);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✓ Slug result:', JSON.stringify(result.output));
    return true;
  } catch (error) {
    console.error('✗ String utils test failed:', error);
    return false;
  }
}

/**
 * Test 3: Array Utils Module
 */
async function testArrayUtils() {
  console.log('\n📊 Test 3: Array Utils Module');
  console.log('═══════════════════════════════════════');

  try {
    const workflow = {
      steps: [
        {
          type: 'action',
          id: 'step1',
          module: 'utilities.array-utils.first',
          inputs: { arr: [1, 2, 3, 4, 5], count: 3 },
          outputAs: 'firstThree',
        },
        {
          type: 'action',
          id: 'step2',
          module: 'utilities.array-utils.sum',
          inputs: { arr: [10, 20, 30, 40] },
          outputAs: 'total',
        },
        {
          type: 'action',
          id: 'step3',
          module: 'utilities.array-utils.average',
          inputs: { arr: [10, 20, 30, 40] },
          outputAs: 'avg',
        },
      ],
    };

    const result = await executeWorkflowConfig(workflow, TEST_USER_ID);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✓ Average result:', JSON.stringify(result.output));
    return true;
  } catch (error) {
    console.error('✗ Array utils test failed:', error);
    return false;
  }
}

/**
 * Test 4: Conditional Logic (if/else)
 */
async function testConditionals() {
  console.log('\n🔀 Test 4: Conditional Logic');
  console.log('═══════════════════════════════════════');

  try {
    const workflow = {
      steps: [
        {
          type: 'action',
          id: 'set-value',
          module: 'utilities.datetime.now',
          inputs: {},
          outputAs: 'timestamp',
        },
        {
          type: 'condition',
          id: 'check-condition',
          condition: '{{timestamp}} !== null',
          then: [
            {
              type: 'action',
              id: 'then-branch',
              module: 'utilities.string-utils.toSlug',
              inputs: { text: 'Condition was TRUE' },
              outputAs: 'result',
            },
          ],
          else: [
            {
              type: 'action',
              id: 'else-branch',
              module: 'utilities.string-utils.toSlug',
              inputs: { text: 'Condition was FALSE' },
              outputAs: 'result',
            },
          ],
        },
      ] as WorkflowStep[],
    };

    const result = await executeWorkflowConfig(workflow as { steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }> }, TEST_USER_ID);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✓ Conditional result:', JSON.stringify(result.output));
    return true;
  } catch (error) {
    console.error('✗ Conditional test failed:', error);
    return false;
  }
}

/**
 * Test 5: ForEach Loop
 */
async function testForEachLoop() {
  console.log('\n🔁 Test 5: ForEach Loop');
  console.log('═══════════════════════════════════════');

  try {
    const workflow = {
      steps: [
        {
          type: 'action',
          id: 'create-array',
          module: 'utilities.array-utils.range',
          inputs: { start: 1, end: 4, step: 1 },
          outputAs: 'numbers',
        },
        {
          type: 'forEach',
          id: 'loop-numbers',
          array: '{{numbers}}',
          itemAs: 'num',
          indexAs: 'i',
          steps: [
            {
              type: 'action',
              id: 'process-item',
              module: 'utilities.string-utils.toSlug',
              inputs: { text: 'Item {{num}} at index {{i}}' },
              outputAs: 'processed',
            },
          ],
        },
      ] as WorkflowStep[],
    };

    const result = await executeWorkflowConfig(workflow as { steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }> }, TEST_USER_ID);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✓ ForEach result:', JSON.stringify(result.output).slice(0, 100));
    return true;
  } catch (error) {
    console.error('✗ ForEach test failed:', error);
    return false;
  }
}

/**
 * Test 6: While Loop
 */
async function testWhileLoop() {
  console.log('\n⏱️  Test 6: While Loop');
  console.log('═══════════════════════════════════════');

  try {
    const workflow = {
      steps: [
        {
          type: 'action',
          id: 'set-counter',
          module: 'utilities.array-utils.range',
          inputs: { start: 0, end: 1, step: 1 },
          outputAs: 'counter',
        },
        {
          type: 'while',
          id: 'increment-loop',
          condition: '{{counter}}.length < 3',
          maxIterations: 10,
          steps: [
            {
              type: 'action',
              id: 'add-item',
              module: 'utilities.array-utils.range',
              inputs: { start: 0, end: '{{counter}}.length + 1', step: 1 },
              outputAs: 'counter',
            },
          ],
        },
      ] as WorkflowStep[],
    };

    const result = await executeWorkflowConfig(workflow as { steps: Array<{ id: string; module: string; inputs: Record<string, unknown>; outputAs?: string }> }, TEST_USER_ID);

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log('✓ While loop completed successfully');
    return true;
  } catch (error) {
    console.error('✗ While loop test failed:', error);
    return false;
  }
}

/**
 * Test 7: Workflow Export/Import
 */
async function testExportImport() {
  console.log('\n💾 Test 7: Workflow Export/Import');
  console.log('═══════════════════════════════════════');

  try {
    // Create a workflow
    const workflow = {
      steps: [
        {
          id: 'step1',
          module: 'utilities.datetime.now',
          inputs: {},
          outputAs: 'timestamp',
        },
      ],
    };

    // Export
    const exported = exportWorkflow(
      'Test Workflow',
      'A simple test workflow',
      workflow,
      {
        author: 'Test Suite',
        tags: ['test', 'demo'],
        category: 'testing',
        requiresCredentials: ['openai'],
      }
    );

    console.log('✓ Exported workflow:', exported.name);
    console.log('✓ Version:', exported.version);
    console.log('✓ Metadata:', JSON.stringify(exported.metadata).slice(0, 50) + '...');

    // Validate
    const validation = validateWorkflowExport(exported);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    console.log('✓ Validation passed');

    // Convert to JSON and back
    const json = JSON.stringify(exported);
    const imported = importWorkflow(json);

    console.log('✓ Imported workflow:', imported.name);
    console.log('✓ Steps count:', imported.config.steps.length);

    return true;
  } catch (error) {
    console.error('✗ Export/import test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
export async function runAllTests() {
  console.log('\n🧪 WORKFLOW SYSTEM TEST SUITE');
  console.log('═══════════════════════════════════════\n');

  const results = {
    credentials: await testCredentials(),
    stringUtils: await testStringUtils(),
    arrayUtils: await testArrayUtils(),
    conditionals: await testConditionals(),
    forEachLoop: await testForEachLoop(),
    whileLoop: await testWhileLoop(),
    exportImport: await testExportImport(),
  };

  console.log('\n📋 TEST SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log('Credentials:       ', results.credentials ? '✓ PASS' : '✗ FAIL');
  console.log('String Utils:      ', results.stringUtils ? '✓ PASS' : '✗ FAIL');
  console.log('Array Utils:       ', results.arrayUtils ? '✓ PASS' : '✗ FAIL');
  console.log('Conditionals:      ', results.conditionals ? '✓ PASS' : '✗ FAIL');
  console.log('ForEach Loop:      ', results.forEachLoop ? '✓ PASS' : '✗ FAIL');
  console.log('While Loop:        ', results.whileLoop ? '✓ PASS' : '✗ FAIL');
  console.log('Export/Import:     ', results.exportImport ? '✓ PASS' : '✗ FAIL');

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.values(results).length;

  console.log('\n═══════════════════════════════════════');
  console.log(`TOTAL: ${passed}/${total} tests passed`);
  console.log('═══════════════════════════════════════\n');

  return results;
}
