import { ReportStatus } from '@prisma/client';

import { UserNotFoundException } from '@modules/users/exceptions/users.exceptions';
import type { PrismaService } from '@prisma-lib/prisma.service';

import {
  CannotReportSelfException,
  ReportAlreadyResolvedException,
  ReportNotFoundException,
} from '../../exceptions/reports.exceptions';
import { ReportsService } from '../reports.service';

const REPORT = {
  id: 'report-1',
  reporterUserId: 'user-1',
  reportedUserId: 'user-2',
  type: 'SPAM',
  description: 'Sends unsolicited links repeatedly',
  status: ReportStatus.OPEN,
  adminNote: null,
  resolvedByUserId: null,
  resolvedAt: null,
  reporter: { id: 'user-1', email: 'reporter@example.com' },
  reported: { id: 'user-2', email: 'reported@example.com' },
  resolvedBy: null,
};

const build = (
  overrides: {
    user?: Partial<Record<string, jest.Mock>>;
    report?: Partial<Record<string, jest.Mock>>;
  } = {},
) => {
  const userDelegate = {
    findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }),
    ...overrides.user,
  };
  const reportDelegate = {
    create: jest.fn().mockResolvedValue(REPORT),
    findMany: jest.fn().mockResolvedValue([REPORT]),
    count: jest.fn().mockResolvedValue(1),
    findUnique: jest.fn().mockResolvedValue(REPORT),
    update: jest.fn().mockResolvedValue({ ...REPORT, status: ReportStatus.RESOLVED }),
    ...overrides.report,
  };
  const prisma = {
    db: { user: userDelegate, report: reportDelegate },
  } as unknown as PrismaService;

  return { prisma, userDelegate, reportDelegate, service: new ReportsService(prisma) };
};

describe('ReportsService.create', () => {
  it('throws CannotReportSelfException when reporting oneself', async () => {
    const { service } = build();

    await expect(
      service.create('user-1', {
        reportedUserId: 'user-1',
        type: 'SPAM',
        description: 'x'.repeat(10),
      } as never),
    ).rejects.toThrow(CannotReportSelfException);
  });

  it('throws UserNotFoundException when the reported user does not exist', async () => {
    const { service } = build({ user: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(
      service.create('user-1', {
        reportedUserId: 'user-2',
        type: 'SPAM',
        description: 'x'.repeat(10),
      } as never),
    ).rejects.toThrow(UserNotFoundException);
  });

  it('creates the report scoped to the reporter', async () => {
    const { service, reportDelegate } = build();

    await service.create('user-1', {
      reportedUserId: 'user-2',
      type: 'FRAUD',
      description: 'Took payment and never delivered'.padEnd(20, '.'),
    } as never);

    expect(reportDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reporterUserId: 'user-1', reportedUserId: 'user-2' }),
      }),
    );
  });
});

describe('ReportsService.listForAdmin', () => {
  it('filters by status when given', async () => {
    const { service, reportDelegate } = build();

    await service.listForAdmin({ page: 1, limit: 20, skip: 0, status: ReportStatus.OPEN });

    expect(reportDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: ReportStatus.OPEN } }),
    );
  });

  it('lists every status when omitted', async () => {
    const { service, reportDelegate } = build();

    await service.listForAdmin({ page: 1, limit: 20, skip: 0 });

    expect(reportDelegate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('ReportsService.resolve', () => {
  it('throws ReportNotFoundException for an unknown report', async () => {
    const { service } = build({ report: { findUnique: jest.fn().mockResolvedValue(null) } });

    await expect(service.resolve('nope', 'admin-1', { status: 'RESOLVED' })).rejects.toThrow(
      ReportNotFoundException,
    );
  });

  it('throws ReportAlreadyResolvedException when already RESOLVED', async () => {
    const { service } = build({
      report: {
        findUnique: jest.fn().mockResolvedValue({ ...REPORT, status: ReportStatus.RESOLVED }),
      },
    });

    await expect(service.resolve('report-1', 'admin-1', { status: 'RESOLVED' })).rejects.toThrow(
      ReportAlreadyResolvedException,
    );
  });

  it('throws ReportAlreadyResolvedException when already REJECTED', async () => {
    const { service } = build({
      report: {
        findUnique: jest.fn().mockResolvedValue({ ...REPORT, status: ReportStatus.REJECTED }),
      },
    });

    await expect(service.resolve('report-1', 'admin-1', { status: 'REJECTED' })).rejects.toThrow(
      ReportAlreadyResolvedException,
    );
  });

  it('stamps resolvedByUserId and resolvedAt', async () => {
    const { service, reportDelegate } = build();

    await service.resolve('report-1', 'admin-1', { status: 'RESOLVED', adminNote: 'Confirmed' });

    expect(reportDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RESOLVED',
          adminNote: 'Confirmed',
          resolvedByUserId: 'admin-1',
        }),
      }),
    );
  });

  it('defaults adminNote to null when omitted', async () => {
    const { service, reportDelegate } = build();

    await service.resolve('report-1', 'admin-1', { status: 'REJECTED' });

    expect(reportDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ adminNote: null }) }),
    );
  });
});
