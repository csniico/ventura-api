import type { RunContext } from './context';
import { addProbe } from './context';
import { request, expectOk } from './client';

/**
 * Shared builders for prerequisite resources so each workflow can stand alone
 * (e.g. an order needs a customer + product). They record their calls under the
 * calling workflow's name and return the created id.
 */

// Per-process counter so prereq emails are unique across workflows in one run
// (customer email is unique per business).
let prereqSeq = 0;

export async function makeCustomer(
  ctx: RunContext,
  workflow: string,
  name = 'Prereq Customer',
): Promise<string> {
  const c = expectOk<{ _id: string }>(
    await request(ctx, workflow, 'prereq: create customer', '/customers', {
      method: 'POST',
      body: {
        name,
        email: `cust-${++prereqSeq}-${ctx.email}`,
        phone: '+1-555-000-0000',
      },
    }),
    'prereq create customer',
  );
  return c._id;
}

export async function makeProduct(
  ctx: RunContext,
  workflow: string,
  price = 25,
  stock = 100,
): Promise<string> {
  const r = expectOk<{ _id: string }>(
    await request(ctx, workflow, 'prereq: create product', '/resources', {
      method: 'POST',
      body: {
        type: 'product',
        name: 'Prereq Product',
        price,
        availableQuantity: stock,
        lowStockThreshold: 5,
      },
    }),
    'prereq create product',
  );
  return r._id;
}

export async function deleteCustomer(
  ctx: RunContext,
  workflow: string,
  id: string,
): Promise<void> {
  await request(ctx, workflow, 'teardown: delete customer', `/customers/${id}`, {
    method: 'DELETE',
  });
}

export async function deleteResource(
  ctx: RunContext,
  workflow: string,
  id: string,
): Promise<void> {
  await request(ctx, workflow, 'teardown: delete resource', `/resources/${id}`, {
    method: 'DELETE',
  });
}

export { addProbe };
