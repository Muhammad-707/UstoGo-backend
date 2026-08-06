import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { SavedAddress } from '@prisma/client';

export class SavedAddressResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Home' }) label!: string;
  @ApiProperty({ format: 'uuid' }) cityId!: string;
  @ApiProperty({ example: 'Rudaki Ave 12, apt 5' }) addressLine!: string;
  @ApiProperty({ example: 'Ismoili Somoni' }) addressDistrict!: string;
  @ApiPropertyOptional({ nullable: true }) contactPhone!: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude!: number | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: string;

  static fromEntity(address: SavedAddress): SavedAddressResponseDto {
    return {
      id: address.id,
      label: address.label,
      cityId: address.cityId,
      addressLine: address.addressLine,
      addressDistrict: address.addressDistrict,
      contactPhone: address.contactPhone,
      latitude: address.latitude?.toNumber() ?? null,
      longitude: address.longitude?.toNumber() ?? null,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
    };
  }
}
