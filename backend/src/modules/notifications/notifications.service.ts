import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/cognito-auth.guard';
import { PrismaService } from '../../database/prisma.service';

const SHOWN = 8;

// What needs attention right now, for the bell in the header: sign-up
// requests (admins only, since only they can decide them) and appointments
// waiting for review.
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(user: AuthenticatedUser) {
    const isAdmin = user.roleName === 'admin';

    const [accessCount, accessRows] = isAdmin
      ? await Promise.all([
          this.prisma.user.count({ where: { status: 'PENDING' } }),
          this.prisma.user.findMany({
            where: { status: 'PENDING' },
            include: { department: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
            take: SHOWN,
          }),
        ])
      : [0, []];

    const [appointmentCount, appointmentRows] = await Promise.all([
      this.prisma.appointment.count({ where: { status: 'PENDING' } }),
      this.prisma.appointment.findMany({
        where: { status: 'PENDING' },
        include: {
          requester: { select: { firstName: true, lastName: true, email: true } },
          department: { select: { name: true } },
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        take: SHOWN,
      }),
    ]);

    return {
      access: accessRows.map((row) => ({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim() || row.email,
        email: row.email,
        department: row.department?.name ?? null,
        // Not submitted yet means they have only signed in so far.
        submitted: row.requestedAt !== null,
        createdAt: row.createdAt,
      })),
      appointments: appointmentRows.map((row) => ({
        id: row.id,
        date: row.date,
        time: row.time,
        subject: row.subject,
        requesterName: `${row.requester.firstName} ${row.requester.lastName}`.trim() || row.requester.email,
        department: row.department?.name ?? null,
      })),
      counts: { access: accessCount, appointments: appointmentCount, total: accessCount + appointmentCount },
    };
  }
}
