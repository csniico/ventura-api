import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Resolve a MongoDB URI for integration tests, isolated per test suite.
 *
 * Jest runs spec files in parallel workers; if they share one database, each
 * suite's cleanup wipes the others' data mid-run. Passing a unique `suite`
 * name gives each file its own database (e.g. `ventura_test_user`).
 *
 * As a safety guard, the resolved database name must contain "test" so we can
 * never run against (and wipe) a real database.
 */
export function resolveTestUri(suite: string): string {
  const base =
    process.env.MONGODB_TEST_URI ?? 'mongodb://localhost:27017/ventura_test';

  if (!/test/i.test(base)) {
    throw new Error(
      `Refusing to run integration tests against "${base}" — the database ` +
        `name must contain "test". Set MONGODB_TEST_URI to a test database.`,
    );
  }

  // Insert the suite suffix into the database-name segment of the URI,
  // before any query string (e.g. ...?retryWrites=true).
  const [withoutQuery, query] = base.split('?');
  const isolated = `${withoutQuery}_${suite}`;
  return query ? `${isolated}?${query}` : isolated;
}
