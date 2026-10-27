import {
  accessApproved,
  accessRejected,
  accessRequested,
  bookingCancelledByRequester,
  bookingCreated,
  bookingDecided,
  personName,
  scheduledWorkOrder,
  TERM,
  waitingReminder,
  type BookingMail,
} from './templates';

const ann = { firstName: 'Ann', lastName: 'Store', email: 'ann@acme.com' };
const kay = { firstName: 'Kay', lastName: 'Keeper', email: 'kay@acme.com' };

const booking = (overrides: Partial<BookingMail> = {}): BookingMail => ({
  subject: 'Gloves',
  date: new Date('2026-10-26'),
  time: '09:00',
  status: 'APPROVED',
  feedback: null,
  issuedNote: null,
  requester: ann,
  feedbackBy: null,
  ...overrides,
});

describe('email templates', () => {
  it('names people, falling back to their email', () => {
    expect(personName(ann)).toBe('Ann Store');
    expect(personName({ ...ann, firstName: '', lastName: '' })).toBe('ann@acme.com');
  });

  it('calls the feature by one configurable word', () => {
    expect(TERM).toEqual({ singular: 'appointment', plural: 'appointments' });
  });

  describe('sign-up', () => {
    it('tells admins who asked, and where they say they work', () => {
      expect(accessRequested(ann, 'Stores')).toEqual({
        subject: 'New sign-up request — Ann Store',
        body: 'Ann Store (ann@acme.com) has asked for access and says they are in Stores. Open Users to approve or reject the request.',
      });
      expect(accessRequested(ann, null).body).toBe(
        'Ann Store (ann@acme.com) has asked for access. Open Users to approve or reject the request.',
      );
    });

    it('welcomes an approved person with their role', () => {
      expect(accessApproved(ann, 'inventory')).toEqual({
        subject: 'Your access has been approved',
        body: 'Hello Ann Store,\n\nYour access has been approved as inventory. You can now sign in and use the system.',
      });
    });

    it('explains a rejection, with the reason when there is one', () => {
      expect(accessRejected(ann, 'Not a contractor of ours').body).toBe(
        'Hello Ann Store,\n\nYour access request was not approved.\n\nReason: Not a contractor of ours\n\nIf you think this is a mistake, please contact an administrator.',
      );
      expect(accessRejected(ann, null).body).not.toContain('Reason');
      expect(accessRejected(ann, null).subject).toBe('Your access request was not approved');
    });
  });

  describe('bookings', () => {
    it('tells the store about a new one', () => {
      expect(bookingCreated(booking())).toEqual({
        subject: 'New appointment request — Gloves',
        body: 'Ann Store booked "Gloves" for 2026-10-26 at 09:00. Open Appointments to review it.',
      });
    });

    it('tells the store when the requester cancels', () => {
      expect(bookingCancelledByRequester(booking())).toEqual({
        subject: 'Appointment cancelled — Gloves',
        body: 'Ann Store cancelled "Gloves" (2026-10-26 at 09:00).',
      });
    });

    it('tells the requester a decision, with feedback, who gave it, and what was issued', () => {
      const email = bookingDecided(
        booking({ status: 'COMPLETED', feedback: 'Handed over', feedbackBy: kay, issuedNote: 'Issued: 10 pcs Gloves' }),
      );

      expect(email.subject).toBe('Your appointment was completed — Gloves');
      expect(email.body).toBe(
        'Hello Ann Store,\n\nYour appointment "Gloves" on 2026-10-26 at 09:00 is now: Completed.\n\nFeedback from Kay Keeper:\nHanded over\n\nIssued: 10 pcs Gloves',
      );
    });

    it('leaves out feedback and notes that are not there, and the name when nobody is recorded', () => {
      expect(bookingDecided(booking()).body).toBe('Hello Ann Store,\n\nYour appointment "Gloves" on 2026-10-26 at 09:00 is now: Approved.');
      expect(bookingDecided(booking({ status: 'DECLINED', feedback: 'Out of stock' })).body).toContain('Feedback:\nOut of stock');
    });

    it('says so plainly when the store cancels', () => {
      const email = bookingDecided(booking({ status: 'CANCELLED', feedback: 'Cancelled by the store.' }));

      expect(email.subject).toBe('Your appointment was cancelled — Gloves');
      expect(email.body).toContain('Your appointment was cancelled by the store.');
    });
  });

  describe('preventive maintenance', () => {
    it('tells the maintenance team what is due, on which asset, and when', () => {
      expect(scheduledWorkOrder({ title: 'Grease bearings', assetTag: 'PUMP-1', assetName: 'Pump', dueDate: new Date('2026-11-01') })).toEqual({
        subject: 'Preventive maintenance due — Grease bearings (PUMP-1)',
        body: 'A preventive work order has been opened for PUMP-1 Pump:\n\nGrease bearings\nDue: 2026-11-01',
      });
    });
  });

  describe('reminder', () => {
    it('lists everything that has been waiting, with a plural subject', () => {
      const email = waitingReminder(
        [{ name: 'Pat Pending', email: 'pat@acme.com' }],
        [{ subject: 'Gloves', requester: 'Ann Store', date: new Date('2026-10-26'), time: '09:00' }],
      );

      expect(email.subject).toBe('Reminder: 2 items waiting for you');
      expect(email.body).toBe(
        'These have been waiting for more than 24 hours:\n\nSign-up requests:\n • Pat Pending (pat@acme.com)\n\nAppointments awaiting review:\n • Gloves — Ann Store, 2026-10-26 09:00',
      );
    });

    it('uses the singular for one item and skips the empty section', () => {
      const email = waitingReminder([{ name: 'Pat', email: 'pat@acme.com' }], []);

      expect(email.subject).toBe('Reminder: 1 item waiting for you');
      expect(email.body).not.toContain('Appointments awaiting review');

      expect(waitingReminder([], [{ subject: 'A', requester: 'B', date: new Date('2026-10-26'), time: '09:00' }]).body).not.toContain('Sign-up requests');
    });
  });
});
