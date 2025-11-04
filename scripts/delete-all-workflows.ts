import { useSQLite, sqliteDb, postgresDb } from '../src/lib/db';
import { workflowsTableSQLite, workflowsTablePostgres } from '../src/lib/schema';

async function deleteAllWorkflows() {
  console.log('🗑️  Deleting all workflows...');

  if (useSQLite) {
    if (!sqliteDb) {
      console.error('SQLite database not initialized');
      process.exit(1);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sqliteDb as any).delete(workflowsTableSQLite);
  } else {
    if (!postgresDb) {
      console.error('PostgreSQL database not initialized');
      process.exit(1);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (postgresDb as any).delete(workflowsTablePostgres);
  }

  console.log('✅ All workflows deleted');
  process.exit(0);
}

deleteAllWorkflows().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
