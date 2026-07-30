import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorSetupResponseDto {
  @ApiProperty({
    description: 'Base32 TOTP secret. Shown once — enter it manually if not scanning.',
  })
  secret!: string;

  @ApiProperty({
    description:
      'otpauth:// URI. Render as a QR code client-side; nothing here does that server-side.',
  })
  otpauthUrl!: string;
}

/** Returned by `POST /auth/login` instead of `AuthResponseDto` when TOTP is enabled. */
export class TwoFactorRequiredResponseDto {
  @ApiProperty({ enum: [true] })
  twoFactorRequired!: true;

  @ApiProperty({
    description:
      'Opaque, single-use, 5-minute credential. Exchange it together with a TOTP code ' +
      'at POST /auth/2fa/verify for a real token pair.',
  })
  challengeToken!: string;
}
