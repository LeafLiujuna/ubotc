import { expect, test } from '@playwright/test';

test('retired storyteller demo links return to the public home page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/demo');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('帽帽钟楼');
  await expect(page.getByRole('link', { name: '帽帽钟楼魔典首页' })).toBeVisible();
  await expect(page.locator('.hero__actions button')).toBeVisible();
  await expect(page.locator('a[href="/demo"], .demo-toolbar')).toHaveCount(0);
});
