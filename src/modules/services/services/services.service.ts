import { Injectable } from '@nestjs/common';
import type { Service } from '@prisma/client';

import { AppConfigService } from '@config/app-config.service';
import {
  CategoryNotFoundException,
  CategoryNotLeafException,
} from '@modules/categories/exceptions/categories.exceptions';
import { MasterNotFoundException } from '@modules/masters/exceptions/masters.exceptions';
import { PrismaService } from '@prisma-lib/prisma.service';

import type { CreateServiceDto } from '../dto/requests/create-service.dto';
import type { UpdateServiceDto } from '../dto/requests/update-service.dto';
import {
  ServiceCategoryNotAttachedException,
  ServiceNotFoundException,
} from '../exceptions/services.exceptions';

/** F-06 (MODULES.md › ServicesModule). Master-scoped CRUD. */
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async list(userId: string): Promise<Service[]> {
    const masterProfileId = await this.masterProfileIdFor(userId);

    return this.prisma.db.service.findMany({
      where: { masterProfileId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateServiceDto): Promise<Service> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    await this.assertAttachedLeafCategory(masterProfileId, dto.categoryId);

    return this.prisma.db.service.create({
      data: {
        masterProfileId,
        categoryId: dto.categoryId,
        title: dto.title,
        priceType: dto.priceType,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        currency: this.config.catalogue.currency,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    await this.findOwnedOrThrow(masterProfileId, id);

    return this.prisma.db.service.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priceType !== undefined ? { priceType: dto.priceType } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const masterProfileId = await this.masterProfileIdFor(userId);
    await this.findOwnedOrThrow(masterProfileId, id);

    await this.prisma.db.service.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async masterProfileIdFor(userId: string): Promise<string> {
    const master = await this.prisma.db.masterProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (master === null) {
      throw new MasterNotFoundException();
    }

    return master.id;
  }

  private async findOwnedOrThrow(masterProfileId: string, id: string): Promise<Service> {
    const service = await this.prisma.db.service.findFirst({ where: { id, masterProfileId } });

    if (service === null) {
      throw new ServiceNotFoundException();
    }

    return service;
  }

  private async assertAttachedLeafCategory(
    masterProfileId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await this.prisma.db.category.findUnique({ where: { id: categoryId } });

    if (category === null) {
      throw new CategoryNotFoundException();
    }

    const activeChild = await this.prisma.db.category.findFirst({
      where: { parentId: categoryId, isActive: true },
    });

    if (activeChild !== null) {
      throw new CategoryNotLeafException();
    }

    const attached = await this.prisma.db.masterCategory.findUnique({
      where: { masterProfileId_categoryId: { masterProfileId, categoryId } },
    });

    if (attached === null) {
      throw new ServiceCategoryNotAttachedException();
    }
  }
}
