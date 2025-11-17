import { describe, it, expect } from 'vitest';
import { validateWorkflowExport } from '@/lib/workflows/import-export';

describe('Workflow Output Validation', () => {
  it('should reject missing outputDisplay.type', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return 1;' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          // Missing type field
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.outputDisplay missing required field: type');
  });

  it('should reject invalid outputDisplay.type', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return 1;' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'invalid-type'
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must be one of: table, list, text, markdown, json, image, images'))).toBe(true);
  });

  it('should reject table display without columns', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'table'
          // Missing columns
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.outputDisplay.type "table" requires columns array');
  });

  it('should reject table display with empty columns array', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'table',
          columns: []
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.outputDisplay.columns cannot be empty for table display');
  });

  it('should reject columns missing required key field', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'table',
          columns: [
            { label: 'Name' } // Missing key
          ]
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.outputDisplay.columns[0] missing required field: key (string)');
  });

  it('should reject columns missing required label field', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'table',
          columns: [
            { key: 'name' } // Missing label
          ]
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('config.outputDisplay.columns[0] missing required field: label (string)');
  });

  it('should reject invalid column type', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        outputDisplay: {
          type: 'table',
          columns: [
            { key: 'name', label: 'Name', type: 'invalid-type' }
          ]
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must be one of: text, link, date, number, boolean'))).toBe(true);
  });

  it('should reject invalid returnValue format', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return 1;' } },
            outputAs: 'result'
          }
        ],
        returnValue: 'result' // Missing curly braces
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('must be in format {{variableName}}'))).toBe(true);
  });

  it('should reject returnValue referencing non-existent step output', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return 1;' } },
            outputAs: 'result'
          }
        ],
        returnValue: '{{nonExistent}}' // References variable that doesn't exist
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('config.returnValue references unknown variable: nonExistent'))).toBe(true);
  });

  it('should accept valid table configuration', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        returnValue: '{{result}}',
        outputDisplay: {
          type: 'table',
          columns: [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'url', label: 'URL', type: 'link' },
            { key: 'count', label: 'Count', type: 'number' }
          ]
        }
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept workflow with dot notation in returnValue', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return { data: [] };' } },
            outputAs: 'result'
          }
        ],
        returnValue: '{{result.data}}'
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept workflow with array indexing in returnValue', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return [];' } },
            outputAs: 'result'
          }
        ],
        returnValue: '{{result[0]}}'
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept workflow without outputDisplay', () => {
    const workflow = {
      version: '1.0',
      name: 'Test',
      description: 'Test workflow',
      config: {
        steps: [
          {
            id: 'step1',
            module: 'utilities.javascript.execute',
            inputs: { options: { code: 'return 1;' } },
            outputAs: 'result'
          }
        ]
      }
    };

    const result = validateWorkflowExport(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept non-table display types without columns', () => {
    const validTypes = ['list', 'text', 'markdown', 'json', 'image', 'images'];

    validTypes.forEach(type => {
      const workflow = {
        version: '1.0',
        name: 'Test',
        description: 'Test workflow',
        config: {
          steps: [
            {
              id: 'step1',
              module: 'utilities.javascript.execute',
              inputs: { options: { code: 'return 1;' } },
              outputAs: 'result'
            }
          ],
          outputDisplay: {
            type
          }
        }
      };

      const result = validateWorkflowExport(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
