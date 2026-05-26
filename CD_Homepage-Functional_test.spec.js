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

  static getUniqueEmail() {
    return `test_${Date.now()}@pintonaturals.com`;
  }

  static getCards() {
    return {
      success: { number: '4242424242424242', expiry: '12/26', cvc: '123' }
    };
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

  async VIN_decode(vin) {
    const start = Date.now();
    const vinInput = this.page.getByRole('textbox', { name: 'Your 5-13 digit VIN *' });
    await vinInput.click();
    await vinInput.fill(vin);

    const [apiResponse] = await Promise.all([
      this.page.waitForResponse(
        resp => resp.url().includes('/api/classic/decode') && resp.request().method() === 'POST',
        { timeout: 30000 }
      ).catch(() => null),
      this.page.getByRole('button', { name: 'Decode classic VIN' }).click(),
      this.page.waitForSelector('button:has-text("Add to garage")', { timeout: 30000 })
    ]);

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

    const decodePayload = apiResponse?.request().postData() ?? null;
    const decodeResponse = apiResponse ? await apiResponse.json() : null;
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

  async decodeVIN(vin) {
    return this.VIN_decode(vin);
  }
}

class CheckoutManager {
  constructor(page) {
    this.page = page;
    this.historyButton = page.getByRole('button', { name: /Access Vehicle History/i });
    this.emailInput = page.getByRole('textbox', { name: /Email Address/i });
    this.checkoutButton = page.getByRole('button', { name: /Proceed to Checkout/i });
    this.preloader = page.locator('text=Preparing Your Checkout');
    this.nameInput = page.getByRole('textbox', { name: /Enter your name/i });
    this.zipInput = page.getByRole('textbox', { name: /ZIP \/ Postal Code/i });
    this.payButton = page.getByRole('button', { name: /Pay \$/i });
  }

  async performPreloaderFlow(email) {
    await test.step('Perform Preloader flow', async () => {
      const searchingIndicator = this.page.getByAltText('Searching');
      await expect(searchingIndicator).not.toBeVisible({ timeout: 60000 });
      await this.historyButton.waitFor({ state: 'visible', timeout: 60000 });
      await this.historyButton.click();
      await expect(this.emailInput).toBeVisible({ timeout: 15000 });
      await this.emailInput.fill(email);
      await this.checkoutButton.click();
      
      await this.preloader.waitFor({ state: 'visible', timeout: 30000 });
      await this.page.waitForURL('**/checkout**', { timeout: 90000 });
      console.log('✅ Navigated to Checkout');
    });
  }

  async fillStripeDetails(card) {
    const cardFrame = this.page.frameLocator('iframe[title*="Secure card number input frame"]');
    await cardFrame.locator('body').waitFor({ state: 'attached', timeout: 15000 });
    await cardFrame.getByRole('textbox', { name: /Card number/i }).fill(card.number);

    const expiryFrame = this.page.frameLocator('iframe[title*="Secure expiration date input frame"]');
    await expiryFrame.locator('body').waitFor({ state: 'attached', timeout: 15000 });
    await expiryFrame.getByRole('textbox', { name: /Expiration date/i }).fill(card.expiry);

    const cvcFrame = this.page.frameLocator('iframe[title*="Secure CVC input frame"]');
    await cvcFrame.locator('body').waitFor({ state: 'attached', timeout: 15000 });
    await cvcFrame.getByRole('textbox', { name: /CVC/i }).fill(card.cvc);
  }

  async performCheckout(name, zip, card) {
    await test.step('Perform Stripe Checkout', async () => {
      await expect(this.nameInput).toBeVisible({ timeout: 15000 });
      await this.nameInput.fill(name);
      await this.fillStripeDetails(card);
      await this.zipInput.fill(zip);
      await expect(this.payButton).toBeEnabled({ timeout: 20000 });
      await this.payButton.click();
    });
  }

  async verifySuccess() {
    await test.step('Verify Redirection to CDMA', async () => {
      await this.page.waitForURL(/.*(generate=true&paid=true|members\/my-reports).*/, { timeout: 60000 });
      console.log(`🎉 Success: ${this.page.url()}`);
    });
  }
}

test.describe('Coupon Workflow and Cookie Verification', () => {
  test('Case 1: Coupon swap logic', async ({ page }) => {
    const couponSwap = new CouponSwapTests(page);
    await couponSwap.runCouponSwapCase('get20', '20%', '20', 'testing', '96%', '96');
    await page.close();
  });

  test('Case 2: Full E2E VHR Checkout flow', async ({ page }) => {
    const couponSwap = new CouponSwapTests(page);
    // Initial setup with coupon
    await couponSwap.runCouponSwapCase('get20', '20%', '20', 'testing', '96%', '96');

    // VIN Decode
    const vin = DataGenerator.getRandomVIN();
    const decoder = new VIN_Decoder(page);
    await decoder.decodeVIN(vin);

    // Checkout Flow
    const checkout = new CheckoutManager(page);
    await checkout.performPreloaderFlow(DataGenerator.getUniqueEmail());
    await checkout.performCheckout('Shahnawaz', '26556', DataGenerator.getCards().success);
    await checkout.verifySuccess();
    
    await page.close();
  });
});
