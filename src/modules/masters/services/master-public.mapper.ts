import { Prisma } from '@prisma/client';

import { localize, type Locale } from '@common/utils/locale.util';

import { stockAvatarUrlFor } from '../constants/stock-media.constants';
import { MasterPublicResponseDto } from '../dto/responses/master-public.response.dto';

/**
 * The single public master projection. Shared with `SearchService` (F-08) and
 * `FavoritesService` — one public projection, one place it is built.
 *
 * A `select`, not an `include`: Prisma 6 rejects scalar fields inside `include`
 * at runtime (`IncludeOnScalar`), so the WhatsApp scalars ride along as selects.
 */
export const MASTER_PUBLIC_SELECT = {
  id: true,
  displayName: true,
  avatarFileId: true,
  bannerFileId: true,
  bio: true,
  yearsOfExperience: true,
  serviceRadiusKm: true,
  ratingAverage: true,
  ratingCount: true,
  completedBookingsCount: true,
  isActive: true,
  approvalStatus: true,
  createdAt: true,
  // P0: the WhatsApp line rides every public projection.
  whatsappPhone: true,
  whatsappEnabled: true,
  city: { select: { name: true, nameTj: true, nameRu: true } },
  categories: { include: { category: { select: { name: true, nameTj: true, nameRu: true } } } },
  services: { where: { isActive: true }, select: { price: true } },
  certificates: {
    where: { deletedAt: null, verifiedAt: { not: null } },
    select: { id: true },
    take: 1,
  },
  portfolioImages: {
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: { fileId: true },
  },
} satisfies Prisma.MasterProfileSelect;

export type MasterRow = Prisma.MasterProfileGetPayload<{ select: typeof MASTER_PUBLIC_SELECT }>;

const BIO_PREVIEW_LENGTH = 200;

export const toMasterPublicDto = (
  row: MasterRow,
  truncateBio: boolean,
  locale: Locale = 'en',
): MasterPublicResponseDto => {
  const dto = new MasterPublicResponseDto();
  const prices = row.services.map((service) => service.price);

  dto.id = row.id;
  dto.displayName = row.displayName;
  dto.avatarFileId = row.avatarFileId;
  // No uploaded avatar yet (demo master) -> a real stock portrait of the right gender.
  dto.avatarUrl = row.avatarFileId === null ? stockAvatarUrlFor(row.displayName) : null;
  dto.bannerFileId = row.bannerFileId;
  dto.bio =
    row.bio !== null && truncateBio && row.bio.length > BIO_PREVIEW_LENGTH
      ? `${row.bio.slice(0, BIO_PREVIEW_LENGTH)}…`
      : row.bio;
  dto.yearsOfExperience = row.yearsOfExperience;
  dto.serviceRadiusKm = row.serviceRadiusKm;
  dto.cityName = localize(row.city.name, row.city.nameTj, row.city.nameRu, locale);
  dto.categories = row.categories.map((entry) =>
    localize(entry.category.name, entry.category.nameTj, entry.category.nameRu, locale),
  );
  dto.ratingAverage = row.ratingAverage.toFixed(2);
  dto.ratingCount = row.ratingCount;
  dto.completedBookingsCount = row.completedBookingsCount;
  dto.priceFrom =
    prices.length === 0
      ? null
      : prices.reduce((min, price) => (price < min ? price : min)).toFixed(2);
  dto.hasCertificates = row.certificates.length > 0;
  dto.portfolioImageFileIds = row.portfolioImages.map((image) => image.fileId);
  dto.isActive = row.isActive;
  dto.approvalStatus = row.approvalStatus;
  // P0: the number is public by design — the whole point is a direct WhatsApp line —
  // but only while the master keeps it enabled.
  dto.whatsappEnabled = row.whatsappEnabled;
  dto.whatsappPhone = row.whatsappEnabled ? row.whatsappPhone : null;

  return dto;
};
