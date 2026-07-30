import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/** A 6-digit TOTP code. Whitespace is not stripped here — the domain util trims it. */
export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: 'The 6-digit code from the authenticator app.' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be exactly 6 digits' })
  code!: string;
}

export class TwoFactorVerifyDto extends TwoFactorCodeDto {
  @ApiProperty({ description: 'The challengeToken returned by a login requiring 2FA.' })
  @IsString()
  @MaxLength(200)
  challengeToken!: string;
}
