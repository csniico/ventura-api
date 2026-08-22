import { runAll } from '../_lib/harness';
import { workflow as onboarding } from '../onboarding/script';
import { workflow as customer } from '../customer/script';
import { workflow as resource } from '../resource/script';
import { workflow as order } from '../order/script';
import { workflow as invoice } from '../invoice/script';
import { workflow as appointment } from '../appointment/script';
import { workflow as search } from '../search/script';
import { workflow as dashboard } from '../dashboard/script';
import { workflow as setup } from '../setup/script';
import { workflow as admin } from '../admin/script';
import { workflow as fileStorage } from '../file-storage/script';

/**
 * Run every workflow in one session (shared onboarding + token), then write a
 * single combined report into this folder. Teardown runs in reverse order.
 */
await runAll(import.meta.dir, [
  onboarding,
  customer,
  resource,
  order,
  invoice,
  appointment,
  search,
  dashboard,
  setup,
  admin,
  fileStorage,
]);
