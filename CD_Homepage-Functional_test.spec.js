import { test, expect } from '@playwright/test';

const BASE_URL = 'https://dev.pintonaturals.com/';

class CouponSwapTests {
  constructor(page) {
    this.page = page;
  }

  getCouponUrl(couponCode) {
    return `${BASE_URL}?offer=${couponCode}`;
  }

  async runCouponSwapCase(oldCoupon, oldBannerText, oldCookieVal, newCoupon, newBannerText, newCookieVal) {
    await test.step(`Navigate to URL with coupon: ${oldCoupon}`, async () => {
      await this.page.goto(this.getCouponUrl(oldCoupon));
    });

    await test.step('Verify banner visibility and dynamic percentage', async () => {
      const banner = this.page.locator('.bg-tertiary.text-white').filter({ hasText: 'You have received' });
      await banner.waitFor({ state: 'visible', timeout: 20000 });
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(oldBannerText);
    });

    await test.step('Verify cookie "perc" value', async () => {
      const cookies = await this.page.context().cookies();
      const percCookie = cookies.find(c => c.name === 'perc');
      expect(percCookie).toBeDefined();
      expect(percCookie.value).toBe(oldCookieVal);
      console.log(`✅ Cookie 'perc' verified: ${percCookie.value}`);
    });

    await test.step(`Apply second coupon: ${newCoupon}`, async () => {
      await this.page.goto(this.getCouponUrl(newCoupon));
    });

    await test.step('Verify banner updated with new percentage', async () => {
      const banner = this.page.locator('.bg-tertiary.text-white').filter({ hasText: 'You have received' });
      await expect(banner).toBeVisible({ timeout: 20000 });
      await expect(banner).toContainText(newBannerText);
    });

    await test.step('Verify cookies after swap', async () => {
      const cookies = await this.page.context().cookies();

      const percCookie = cookies.find(c => c.name === 'perc');
      expect(percCookie).toBeDefined();
      expect(percCookie.value).toBe(newCookieVal);

      const prevCouponCookie = cookies.find(c => c.name === 'prev_coupon');
      expect(prevCouponCookie).toBeDefined();
      expect(prevCouponCookie.value).toBe(oldCoupon);

      console.log(`✅ Swap verified. New perc: ${percCookie.value}, Prev coupon: ${prevCouponCookie.value}`);
    });
  }
}

test.describe('Coupon Workflow and Cookie Verification', () => {
  test('Case 1: Coupon swap logic', async ({ page }) => {
    const couponSwap = new CouponSwapTests(page);
    // Applying get20 (20% / 20) and then swapping to testing (96% / 96)
    await couponSwap.runCouponSwapCase('get20', '20%', '20', 'testing', '96%', '96');
  });
});
