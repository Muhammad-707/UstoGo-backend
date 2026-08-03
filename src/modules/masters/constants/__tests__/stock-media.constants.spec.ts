import {
  inferGender,
  stockAvatarUrlFor,
  stockBannerUrlFor,
  stockGalleryFor,
} from '../stock-media.constants';

describe('inferGender', () => {
  it('recognizes female first names from the explicit list', () => {
    expect(inferGender('Sarah Jenkins')).toBe('female');
    expect(inferGender('Elena Rostova')).toBe('female');
    expect(inferGender('Nigora Saidova')).toBe('female');
  });

  it('falls back to the Slavic/Tajik «ends with -a» heuristic', () => {
    expect(inferGender('Gulbahora Nazarova')).toBe('female');
  });

  it('treats everything else as male', () => {
    expect(inferGender('Marcus Vance')).toBe('male');
    expect(inferGender('Alex Morgan')).toBe('male');
    expect(inferGender('Farrukh Karimov')).toBe('male');
  });
});

describe('stock media helpers', () => {
  it('picks a portrait matching the master’s gender, deterministically', () => {
    const maleUrl = stockAvatarUrlFor('Marcus Vance');
    const femaleUrl = stockAvatarUrlFor('Sarah Jenkins');

    expect(maleUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    expect(femaleUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    expect(maleUrl).not.toBe(femaleUrl);
    expect(stockAvatarUrlFor('Marcus Vance')).toBe(maleUrl);
  });

  it('serves a profession-specific banner and 3-4 portfolio photos', () => {
    expect(stockBannerUrlFor('plumbing')).toBe(
      'https://images.unsplash.com/photo-1585128792020-803d29415281?auto=format&fit=crop&w=1200&q=80',
    );
    const gallery = stockGalleryFor('cleaning');
    expect(gallery.length).toBeGreaterThanOrEqual(3);
    expect(gallery.length).toBeLessThanOrEqual(4);
    for (const url of gallery) {
      expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-\d/);
    }
  });

  it('falls back to generic tools imagery for an unknown profession', () => {
    expect(stockBannerUrlFor('unknown-slug')).toBe(stockBannerUrlFor(null));
    expect(stockGalleryFor('unknown-slug')).toHaveLength(4);
  });
});
