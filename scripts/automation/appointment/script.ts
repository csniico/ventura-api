import { addProbe, type RunContext } from '../_lib/context';
import { request, expectOk } from '../_lib/client';
import { standalone, type Workflow } from '../_lib/harness';
import { makeCustomer, deleteCustomer } from '../_lib/factories';

function isoInHours(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString();
}

/** Full appointment lifecycle: create (invitees + recurrence), list, search, patch, status, delete. */
export const workflow: Workflow = {
  name: 'appointment',
  async run(ctx: RunContext) {
    const customerId = await makeCustomer(ctx, 'appointment', 'Appt Customer');
    ctx.ids.apptCustomerId = customerId;

    const appt = expectOk<{ _id: string }>(
      await request(ctx, 'appointment', 'create', '/appointments', {
        method: 'POST',
        body: {
          title: 'Client consultation',
          start: isoInHours(24),
          end: isoInHours(25),
          notes: 'Bring the signed contract.',
          location: 'Office, Accra',
          invitees: [
            { name: 'Linked Customer', customerId },
            { name: 'Guest', email: `guest-${ctx.email}` },
          ],
          recurrence: { frequency: 'weekly', interval: 2, until: isoInHours(24 * 90) },
        },
      }),
      'create appointment',
    );
    ctx.ids.appointmentId = appt._id;

    await request(ctx, 'appointment', 'list', '/appointments');
    await request(
      ctx,
      'appointment',
      'list windowed',
      `/appointments?from=${encodeURIComponent(isoInHours(0))}&to=${encodeURIComponent(isoInHours(24 * 7))}`,
    );
    await request(ctx, 'appointment', 'get by id', `/appointments/${appt._id}`);
    await request(ctx, 'appointment', 'update', `/appointments/${appt._id}`, {
      method: 'PATCH',
      body: { title: 'Client consultation (rescheduled)', clearRecurrence: true },
    });
    await request(ctx, 'appointment', 'status → completed', `/appointments/${appt._id}/status`, {
      method: 'PATCH',
      body: { status: 'completed' },
    });

    addProbe(ctx, 'appointment list', '/appointments');
    addProbe(ctx, 'appointment detail', `/appointments/${appt._id}`);
  },

  async teardown(ctx: RunContext) {
    if (ctx.ids.appointmentId) {
      await request(ctx, 'appointment', 'delete', `/appointments/${ctx.ids.appointmentId}`, {
        method: 'DELETE',
      });
    }
    if (ctx.ids.apptCustomerId)
      await deleteCustomer(ctx, 'appointment', ctx.ids.apptCustomerId);
  },
};

if (import.meta.main) {
  await standalone(import.meta.dir, workflow);
}
