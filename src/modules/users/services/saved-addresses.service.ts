import { Injectable } from '@nestjs/common';
import type { SavedAddress } from '@prisma/client';

import { PrismaService } from '@prisma-lib/prisma.service';
import { TransactionManager, type PrismaTransaction } from '@prisma-lib/transaction.manager';

import { MAX_SAVED_ADDRESSES } from '../constants/users.constants';
import type { CreateSavedAddressDto } from '../dto/requests/create-saved-address.dto';
import type { UpdateSavedAddressDto } from '../dto/requests/update-saved-address.dto';
import {
  CityNotFoundException,
  SavedAddressLimitExceededException,
  SavedAddressNotFoundException,
  UserNotFoundException,
} from '../exceptions/users.exceptions';

/**
 * B-50 (MODULES.md › UsersModule). A client's labeled, reusable addresses — plural
 * and structured where `ClientProfile.defaultAddress` is a single free-text field
 * kept as-is for backward compatibility. Follows `PortfolioImage`'s ownership
 * pattern: every query scoped by the caller's own `clientProfileId`, a foreign or
 * unknown id is `404`, never `403` (AUTHORIZATION.md §1).
 */
@Injectable()
export class SavedAddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tx: TransactionManager,
  ) {}

  async list(userId: string): Promise<SavedAddress[]> {
    const clientProfileId = await this.clientProfileIdFor(userId);

    return this.prisma.db.savedAddress.findMany({
      where: { clientProfileId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateSavedAddressDto): Promise<SavedAddress> {
    const clientProfileId = await this.clientProfileIdFor(userId);
    await this.assertCityExists(dto.cityId);
    await this.assertUnderLimit(clientProfileId);

    return this.tx.run(async (tx) => {
      if (dto.isDefault === true) {
        await this.clearDefault(tx, clientProfileId);
      }

      return tx.savedAddress.create({
        data: {
          clientProfileId,
          label: dto.label,
          cityId: dto.cityId,
          addressLine: dto.line,
          addressDistrict: dto.district,
          isDefault: dto.isDefault ?? false,
          ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
        },
      });
    });
  }

  async update(
    userId: string,
    addressId: string,
    dto: UpdateSavedAddressDto,
  ): Promise<SavedAddress> {
    const clientProfileId = await this.clientProfileIdFor(userId);
    await this.assertOwned(clientProfileId, addressId);
    if (dto.cityId !== undefined) {
      await this.assertCityExists(dto.cityId);
    }

    return this.tx.run(async (tx) => {
      if (dto.isDefault === true) {
        await this.clearDefault(tx, clientProfileId);
      }

      return tx.savedAddress.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
          ...(dto.line !== undefined ? { addressLine: dto.line } : {}),
          ...(dto.district !== undefined ? { addressDistrict: dto.district } : {}),
          ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
          ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
          ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
  }

  /** Soft delete. A deleted default address is not auto-replaced by another one. */
  async remove(userId: string, addressId: string): Promise<void> {
    const clientProfileId = await this.clientProfileIdFor(userId);
    await this.assertOwned(clientProfileId, addressId);

    await this.prisma.db.savedAddress.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  private async clientProfileIdFor(userId: string): Promise<string> {
    const client = await this.prisma.db.clientProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (client === null) {
      throw new UserNotFoundException();
    }
    return client.id;
  }

  private async assertOwned(clientProfileId: string, addressId: string): Promise<void> {
    const address = await this.prisma.db.savedAddress.findFirst({
      where: { id: addressId, clientProfileId, deletedAt: null },
      select: { id: true },
    });
    if (address === null) {
      throw new SavedAddressNotFoundException();
    }
  }

  private async assertCityExists(cityId: string): Promise<void> {
    const city = await this.prisma.db.city.findFirst({ where: { id: cityId, isActive: true } });
    if (city === null) {
      throw new CityNotFoundException();
    }
  }

  private async assertUnderLimit(clientProfileId: string): Promise<void> {
    const count = await this.prisma.db.savedAddress.count({
      where: { clientProfileId, deletedAt: null },
    });
    if (count >= MAX_SAVED_ADDRESSES) {
      throw new SavedAddressLimitExceededException();
    }
  }

  private async clearDefault(tx: PrismaTransaction, clientProfileId: string): Promise<void> {
    await tx.savedAddress.updateMany({
      where: { clientProfileId, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });
  }
}
