const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  reporter: [['html', { open: 'always' }]],
  use: {
    baseURL: 'https://dev.pintonaturals.com/',
    browserName: 'chromium',
    headless: false, // Ensure headed mode is default
    viewport: { width: 1280, height: 720 },
    // Ensure standard incognito isolation by not using shared storageState
    storageState: undefined, 
  },
});
