import { PaginatedDto } from '../dto/paginated.dto';

describe('PaginatedDto.from', () => {
  it('computes the envelope from API.md §1.3', () => {
    expect(PaginatedDto.from(['a', 'b'], 137, 1, 20).meta).toEqual({
      page: 1,
      limit: 20,
      total: 137,
      totalPages: 7,
      hasNext: true,
      hasPrev: false,
    });
  });

  it('rounds a partial final page up', () => {
    expect(PaginatedDto.from([], 21, 1, 20).meta.totalPages).toBe(2);
  });

  it('reports no next page on the last page', () => {
    expect(PaginatedDto.from([], 40, 2, 20).meta).toMatchObject({ hasNext: false, hasPrev: true });
  });

  it('handles an empty result set without claiming a page exists', () => {
    expect(PaginatedDto.from([], 0, 1, 20).meta).toMatchObject({
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });

  it('reports both neighbours on a middle page', () => {
    expect(PaginatedDto.from([], 100, 3, 20).meta).toMatchObject({ hasNext: true, hasPrev: true });
  });

  it('does not divide by zero when the limit is zero', () => {
    expect(PaginatedDto.from([], 10, 1, 0).meta.totalPages).toBe(0);
  });

  it('passes the items through untouched', () => {
    const items = [{ id: '1' }, { id: '2' }];

    expect(PaginatedDto.from(items, 2, 1, 20).items).toBe(items);
  });
});
