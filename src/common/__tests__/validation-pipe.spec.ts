import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsInt,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { createValidationPipe } from '@/bootstrap/validation';

import { PAGINATION, PaginationQueryDto } from '../dto/pagination-query.dto';
import { ValidationFailedException } from '../exceptions/generic.exceptions';

class AddressDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  line!: string;
}

class SampleDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ type: () => AddressDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

/** Same shape, minus the presence check — used to pin the trap below. */
class NoPresenceCheckDto {
  @ApiProperty({ type: () => AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

const meta = { type: 'body', metatype: SampleDto } as const;

const transform = async (value: unknown): Promise<unknown> =>
  createValidationPipe().transform(value, meta);

const expectRejection = async (value: unknown): Promise<ValidationFailedException> => {
  try {
    await transform(value);
  } catch (error) {
    return error as ValidationFailedException;
  }
  throw new Error('expected the pipe to reject');
};

const valid = { email: 'a@b.co', quantity: 2, address: { line: 'Amir Temur 1' } };

describe('createValidationPipe', () => {
  it('passes a valid payload through', async () => {
    await expect(transform(valid)).resolves.toMatchObject(valid);
  });

  it('reports every violation at once rather than stopping at the first', async () => {
    const error = await expectRejection({ email: 'nope', quantity: 0, address: { line: 'x' } });

    expect(error.details.map((detail) => detail.field).sort()).toEqual(['email', 'quantity']);
  });

  // Mass assignment is defeated structurally: RegisterClientDto has no `role` property,
  // so `{"role":"ADMIN"}` cannot reach a service (VALIDATION.md §1).
  it('rejects an unknown property instead of silently stripping it', async () => {
    const error = await expectRejection({ ...valid, role: 'ADMIN' });

    expect(error.details.map((detail) => detail.field)).toContain('role');
  });

  it('uses dot paths for nested violations', async () => {
    const error = await expectRejection({ ...valid, address: { line: 'x'.repeat(51) } });

    expect(error.details[0]?.field).toBe('address.line');
  });

  it('reports a missing nested object when the DTO declares a presence check', async () => {
    const error = await expectRejection({ email: 'a@b.co', quantity: 1 });

    expect(error.details.map((detail) => detail.field)).toContain('address');
  });

  // Pinning a trap rather than a feature. `@ValidateNested()` runs the child's
  // decorators only when the value exists, so an omitted required object passes
  // straight through unless a presence decorator is also present — the same class of
  // silent hole as `@ValidateNested()` without `@Type()`. VALIDATION.md §2 requires
  // `@IsDefined()` on every required nested object for exactly this reason.
  it('lets an omitted nested object through when no presence check is declared', async () => {
    await expect(
      createValidationPipe().transform({}, { type: 'body', metatype: NoPresenceCheckDto } as never),
    ).resolves.toBeDefined();
  });

  // A rejected password must not reach the error body, because from there it reaches
  // any log that records the response (VALIDATION.md §1).
  it('never echoes the submitted value', async () => {
    const error = await expectRejection({ ...valid, email: 'hunter2-not-an-email' });

    expect(JSON.stringify(error.details)).not.toContain('hunter2');
  });

  it('raises ValidationFailedException, so the envelope code is VALIDATION_FAILED', async () => {
    await expect(transform({})).rejects.toBeInstanceOf(ValidationFailedException);
  });

  it('does not implicitly convert a numeric string', async () => {
    const error = await expectRejection({ ...valid, quantity: '2' });

    expect(error.details.map((detail) => detail.field)).toContain('quantity');
  });
});

describe('PaginationQueryDto', () => {
  const transformQuery = async (value: unknown): Promise<PaginationQueryDto> =>
    (await createValidationPipe().transform(value, {
      type: 'query',
      metatype: PaginationQueryDto,
    } as never)) as PaginationQueryDto;

  it('applies the documented defaults', async () => {
    const query = await transformQuery({});

    expect(query.page).toBe(PAGINATION.DEFAULT_PAGE);
    expect(query.limit).toBe(PAGINATION.DEFAULT_LIMIT);
  });

  // Query strings are always strings; @Type(() => Number) is what makes this work
  // while implicit conversion stays off everywhere else.
  it('converts numeric query strings', async () => {
    const query = await transformQuery({ page: '3', limit: '50' });

    expect(query.page).toBe(3);
    expect(query.limit).toBe(50);
  });

  it('derives skip from page and limit', async () => {
    expect((await transformQuery({ page: '3', limit: '20' })).skip).toBe(40);
  });

  it('enforces the hard limit cap', async () => {
    await expect(transformQuery({ limit: '500' })).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
  });

  it('rejects a page below one', async () => {
    await expect(transformQuery({ page: '0' })).rejects.toBeInstanceOf(ValidationFailedException);
  });
});
