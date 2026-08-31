import { NotFoundException } from '@nestjs/common';
import { createMockPrisma, MockPrisma } from '../../../test/utils/mock-prisma';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let prisma: MockPrisma;
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new OrganizationsService(prisma);
  });

  describe('findAll', () => {
    it('delegates straight to prisma.organization.findMany, including departments', async () => {
      const orgs = [{ id: 'org-1', name: 'Acme' }];
      prisma.organization.findMany.mockResolvedValue(orgs as never);

      const result = await service.findAll();

      expect(prisma.organization.findMany).toHaveBeenCalledWith({ include: { departments: true } });
      expect(result).toEqual(orgs);
    });
  });

  describe('findOne', () => {
    it('returns the organization when found', async () => {
      const org = { id: 'org-1', name: 'Acme' };
      prisma.organization.findUnique.mockResolvedValue(org as never);

      await expect(service.findOne('org-1')).resolves.toEqual(org);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('delegates straight to prisma.organization.create', async () => {
      const dto = { name: 'Acme' };
      prisma.organization.create.mockResolvedValue({ id: 'org-1', ...dto } as never);

      const result = await service.create(dto);

      expect(prisma.organization.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual({ id: 'org-1', ...dto });
    });
  });
});
