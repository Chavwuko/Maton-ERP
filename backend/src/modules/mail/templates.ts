// The wording of every email. Plain text on purpose: it reads the same in any
// mail program and cannot be spoofed with markup. Each function returns the
// subject and the body; MailService adds the "[App name]" prefix and sign-off.

// What the feature is called. Kept in one place because the word is due to
// change (see the Roadmap), and emails should follow it.
export const TERM = { singular: 'appointment', plural: 'appointments' };
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export interface Person {
  firstName: string;
  lastName: string;
  email: string;
}

export interface BookingMail {
  subject: string;
  date: Date;
  time: string;
  status: string;
  feedback: string | null;
  issuedNote: string | null;
  requester: Person;
  feedbackBy: Person | null;
}

export interface Email {
  subject: string;
  body: string;
}

export const personName = (person: Person) => `${person.firstName} ${person.lastName}`.trim() || person.email;
const day = (date: Date) => date.toISOString().slice(0, 10);
const when = (booking: BookingMail) => `${day(booking.date)} at ${booking.time}`;

export function accessRequested(requester: Person, departmentName: string | null): Email {
  return {
    subject: `New sign-up request — ${personName(requester)}`,
    body:
      `${personName(requester)} (${requester.email}) has asked for access` +
      `${departmentName ? ` and says they are in ${departmentName}` : ''}. Open Users to approve or reject the request.`,
  };
}

export function accessApproved(user: Person, roleName: string): Email {
  return {
    subject: 'Your access has been approved',
    body: `Hello ${personName(user)},\n\nYour access has been approved as ${roleName}. You can now sign in and use the system.`,
  };
}

export function accessRejected(user: Person, reason: string | null): Email {
  return {
    subject: 'Your access request was not approved',
    body:
      `Hello ${personName(user)},\n\nYour access request was not approved.` +
      `${reason ? `\n\nReason: ${reason}` : ''}\n\nIf you think this is a mistake, please contact an administrator.`,
  };
}

// To the store when someone books.
export function bookingCreated(booking: BookingMail): Email {
  return {
    subject: `New ${TERM.singular} request — ${booking.subject}`,
    body: `${personName(booking.requester)} booked "${booking.subject}" for ${when(booking)}. Open ${cap(TERM.plural)} to review it.`,
  };
}

// To the store when the requester cancels their own.
export function bookingCancelledByRequester(booking: BookingMail): Email {
  return {
    subject: `${cap(TERM.singular)} cancelled — ${booking.subject}`,
    body: `${personName(booking.requester)} cancelled "${booking.subject}" (${when(booking)}).`,
  };
}

// To the requester when the store cancels, or decides, their booking.
export function bookingDecided(booking: BookingMail): Email {
  const status = booking.status.toLowerCase();
  const by = booking.feedbackBy ? ` from ${personName(booking.feedbackBy)}` : '';
  const store = booking.status === 'CANCELLED' ? `Your ${TERM.singular} was cancelled by the store.` : '';
  return {
    subject:
      booking.status === 'CANCELLED'
        ? `Your ${TERM.singular} was cancelled — ${booking.subject}`
        : `Your ${TERM.singular} was ${status} — ${booking.subject}`,
    body:
      `Hello ${personName(booking.requester)},\n\n` +
      `Your ${TERM.singular} "${booking.subject}" on ${when(booking)} is now: ${cap(status)}.` +
      `${store ? `\n\n${store}` : ''}` +
      `${booking.feedback ? `\n\nFeedback${by}:\n${booking.feedback}` : ''}` +
      `${booking.issuedNote ? `\n\n${booking.issuedNote}` : ''}`,
  };
}

// To whoever does the maintenance when a schedule opens a preventive work order.
export function scheduledWorkOrder(workOrder: { title: string; assetTag: string; assetName: string; dueDate: Date }): Email {
  return {
    subject: `Preventive maintenance due — ${workOrder.title} (${workOrder.assetTag})`,
    body:
      `A preventive work order has been opened for ${workOrder.assetTag} ${workOrder.assetName}:

` +
      `${workOrder.title}
Due: ${day(workOrder.dueDate)}`,
  };
}

export function waitingReminder(
  requests: { name: string; email: string }[],
  bookings: { subject: string; requester: string; date: Date; time: string }[],
): Email {
  const count = requests.length + bookings.length;
  const lines: string[] = ['These have been waiting for more than 24 hours:'];
  if (requests.length > 0) {
    lines.push('', 'Sign-up requests:', ...requests.map((r) => ` • ${r.name} (${r.email})`));
  }
  if (bookings.length > 0) {
    lines.push(
      '',
      `${cap(TERM.plural)} awaiting review:`,
      ...bookings.map((b) => ` • ${b.subject} — ${b.requester}, ${day(b.date)} ${b.time}`),
    );
  }
  return { subject: `Reminder: ${count} item${count === 1 ? '' : 's'} waiting for you`, body: lines.join('\n') };
}
