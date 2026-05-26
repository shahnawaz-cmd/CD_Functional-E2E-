import { test, expect } from '@playwright/test';

test.setTimeout(120000);
const BASE_URL = 'https://dev.pintonaturals.com/';

class DataGenerator {
  static getRandomVIN() {
    // Base VIN: 2G37M2P213086
    let vin = '2G37M2P213086'.split('');
    const digitPositions = [0, 2, 3, 7, 8, 9, 10, 11, 12];
    
    // Randomly change 4 numeric positions
    for (let i = 0; i < 4; i++) {
        const idx = Math.floor(Math.random() * digitPositions.length);
        const pos = digitPositions.splice(idx, 1)[0];
        vin[pos] = Math.floor(Math.random() * 10).toString();
    }
    return vin.join('');
  }
}

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

class VIN_Decoder {
  constructor(page) {
    this.page = page;
  }

  /**
   * Case 2: VIN decode (mapped VN)
   * Performs VIN decoding by filling the VIN input and clicking the decode button.
   * Returns timing and resulting URL.
   */
  /**
   * Case 2: VIN decode (mapped VN)
   * Performs VIN decoding by filling the VIN input, clicking the decode button,
   * waiting for the decode API POST request, then waiting for the preview page
   * where an "Add to garage" button appears. Returns timing, URL, API payload and response.
   */
  async VIN_decode(vin) {
    const start = Date.now();
    const vinInput = this.page.getByRole('textbox', { name: 'Your 5-13 digit VIN *' });
    await vinInput.click();
    await vinInput.fill(vin);

    // Use Promise.all to handle the click and waits concurrently
    const [apiResponse] = await Promise.all([
      this.page.waitForResponse(
        resp => resp.url().includes('/api/classic/decode') && resp.request().method() === 'POST',
        { timeout: 30000 }
      ).catch(() => null),
      this.page.getByRole('button', { name: 'Decode classic VIN' }).click(),
      this.page.waitForSelector('button:has-text("Add to garage")', { timeout: 30000 })
    ]);

    // Ensure we are on the preview page before continuing
    await expect(this.page.locator('button:has-text("Add to garage")')).toBeVisible();

    let updateApiResponse = null;
    await test.step('Manually update vehicle details', async () => {
      await this.page.getByRole('button', { name: 'Click to edit' }).click();
      await this.page.getByRole('button', { name: 'Update VIN, year, make, and' }).click();
      
      const yearCombobox = this.page.getByRole('combobox').first();
      await yearCombobox.waitFor({ state: 'visible', timeout: 10000 });
      await yearCombobox.click();
      await this.page.getByRole('button', { name: '1966' }).click();
      
      await this.page.getByRole('combobox').filter({ hasText: 'Make' }).click();
      await this.page.getByRole('button', { name: 'Aermacchi' }).click();
      
      await this.page.getByRole('combobox').filter({ hasText: 'Model' }).click();
      await this.page.getByRole('button', { name: 'ALA Verde Serie 1' }).click();
      
      await this.page.getByRole('combobox').filter({ hasText: 'Trim' }).click();
      await this.page.getByRole('button', { name: 'Base' }).click();
      
      // Capture the update API call
      [updateApiResponse] = await Promise.all([
        this.page.waitForResponse(
          resp => resp.url().includes('update-classic-decode') && resp.request().method() === 'POST',
          { timeout: 30000 }
        ).catch(() => null),
        this.page.getByRole('button', { name: 'Update', exact: true }).click()
      ]);
    });

    const end = Date.now();
    const url = this.page.url();

    // Extract payload & response for initial decode
    const decodePayload = apiResponse?.request().postData() ?? null;
    const decodeResponse = apiResponse ? await apiResponse.json() : null;

    // Extract payload & response for update
    const updatePayload = updateApiResponse?.request().postData() ?? null;
    const updateResponse = updateApiResponse ? await updateApiResponse.json() : null;

    console.log(`Initial Decode API Payload: ${decodePayload}`);
    console.log(`Initial Decode API Response: ${JSON.stringify(decodeResponse)}`);
    console.log(`Update API Payload: ${updatePayload}`);
    console.log(`Update API Response: ${JSON.stringify(updateResponse)}`);

    return {
      durationSec: (end - start) / 1000,
      url,
      decode: { payload: decodePayload, response: decodeResponse },
      update: { payload: updatePayload, response: updateResponse }
    };
  }

  // Alias for backward compatibility
  async decodeVIN(vin) {
    return this.VIN_decode(vin);
  }

}


test.describe('Coupon Workflow and Cookie Verification', () => {
  test('Case 1: Coupon swap logic', async ({ page }) => {
  const couponSwap = new CouponSwapTests(page);
  // Applying get20 (20% / 20) and then swapping to testing (96% / 96)
  await couponSwap.runCouponSwapCase('get20', '20%', '20', 'testing', '96%', '96');

  // VIN decoding after coupon workflow
  const vin = DataGenerator.getRandomVIN();
  const decoder = new VIN_Decoder(page);
  const result = await decoder.decodeVIN(vin);
  console.log(`VIN decode took ${result.durationSec}s, navigated to ${result.url}`);
  console.log(`Captured API data:`, JSON.stringify(result, null, 2));
  await page.close();
});
});
