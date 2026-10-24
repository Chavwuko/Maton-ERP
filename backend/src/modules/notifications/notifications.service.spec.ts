import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const user = (roleName: string): AuthenticatedUser =>
  ({ id: 'u1', roleName, email: 'a@acme.test', firstName: 'A', lastName: 'B' }) as AuthenticatedUser;

describe('NotificationsService', () => {
  let prisma: MockPrisma;
  let service: NotificationsService;

  const pendingAppointment = {
    id: 'appt-1',
    date: new Date('2026-10-26'),
    time: '09:00',
    subject: 'Gloves',
    requester: { firstName: 'Ann', lastName: 'Store', email: 'ann@acme.test' },
    department: { name: 'Workshop' },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new NotificationsService(prisma);
    prisma.appointment.count.mockResolvedValue(3);
    prisma.appointment.findMany.mockResolvedValue([pendingAppointment] as never);
  });

  it('shows an admin both sign-up requests and appointments, with a total', async () => {
    prisma.user.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'new-1',
        firstName: 'Pat',
        lastName: 'Pending',
        email: 'pat@acme.test',
        department: { name: 'Stores' },
        requestedAt: new Date('2026-10-20'),
        createdAt: new Date('2026-10-19'),
      },
      { id: 'new-2', firstName: '', lastName: '', email: 'silent@acme.test', department: null, requestedAt: null, createdAt: new Date('2026-10-21') },
    ] as never);

    const result = await service.forUser(user('admin'));

    expect(result.counts).toEqual({ access: 2, appointments: 3, total: 5 });
    expect(result.access).toEqual([
      { id: 'new-1', name: 'Pat Pending', email: 'pat@acme.test', department: 'Stores', submitted: true, createdAt: new Date('2026-10-19') },
      { id: 'new-2', name: 'silent@acme.test', email: 'silent@acme.test', department: null, submitted: false, createdAt: new Date('2026-10-21') },
    ]);
    expect(result.appointments).toEqual([
      { id: 'appt-1', date: new Date('2026-10-26'), time: '09:00', subject: 'Gloves', requesterName: 'Ann Store', department: 'Workshop' },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 8 }),
    );
  });

  it('keeps sign-up requests from everyone but admin, and does not even look them up', async () => {
    const result = await service.forUser(user('inventory'));

    expect(result.access).toEqual([]);
    expect(result.counts).toEqual({ access: 0, appointments: 3, total: 3 });
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('names a requester by email when they have no name, and tolerates no department', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { ...pendingAppointment, requester: { firstName: '', lastName: '', email: 'ann@acme.test' }, department: null },
    ] as never);

    const result = await service.forUser(user('inventory'));

    expect(result.appointments[0]).toMatchObject({ requesterName: 'ann@acme.test', department: null });
  });
});

describe('NotificationsController', () => {
  it('asks for the signed-in user', () => {
    const service = { forUser: jest.fn() } as unknown as jest.Mocked<NotificationsService>;
    const req = { user: { id: 'u1' } } as never;

    new NotificationsController(service).forUser(req);

    expect(service.forUser).toHaveBeenCalledWith({ id: 'u1' });
  });
});
