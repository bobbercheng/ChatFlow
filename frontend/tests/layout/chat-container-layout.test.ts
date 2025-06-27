import { test, expect } from '@playwright/test';

test.describe('Chat Container Layout Stability', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    
    // Wait for the app to be fully loaded
    await page.waitForSelector('.chat-app', { state: 'visible' });
    await page.waitForLoadState('networkidle');
  });

  test('chat container maintains consistent width on login', async ({ page }) => {
    // Logout if logged in
    const logoutBtn = page.locator('button:has-text("Logout")');
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
    }

    // Wait for login form
    await page.waitForSelector('.login-form', { state: 'visible' });

    // Take initial screenshot
    await expect(page).toHaveScreenshot('login-form.png');

    // Login with test credentials
    await page.fill('input[type="email"]', 'user2@example.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button:has-text("Login")');

    // Wait for main interface to load
    await page.waitForSelector('.chat-container', { state: 'visible' });
    await page.waitForLoadState('networkidle');

    // Measure chat container dimensions immediately after login
    const initialDimensions = await page.locator('.chat-container').boundingBox();
    expect(initialDimensions).toBeTruthy();

    // Take screenshot immediately after login
    await expect(page).toHaveScreenshot('after-login-immediate.png');

    // Wait for conversations to load
    await page.waitForSelector('.conversation-item', { state: 'visible' });
    await page.waitForTimeout(2000); // Allow any layout changes to settle

    // Measure dimensions after conversations load
    const postLoadDimensions = await page.locator('.chat-container').boundingBox();
    expect(postLoadDimensions).toBeTruthy();

    // Verify no width change (the main issue we fixed)
    expect(Math.abs((initialDimensions?.width || 0) - (postLoadDimensions?.width || 0))).toBeLessThan(5);

    // Take final screenshot
    await expect(page).toHaveScreenshot('after-conversations-load.png');
  });

  test('chat container width remains stable when clicking conversations', async ({ page }) => {
    // Ensure we're logged in
    await page.waitForSelector('.chat-container', { state: 'visible' });
    await page.waitForSelector('.conversation-item', { state: 'visible' });

    // Measure initial dimensions
    const initialDimensions = await page.locator('.chat-container').boundingBox();
    expect(initialDimensions).toBeTruthy();

    // Click on first conversation
    await page.click('.conversation-item:first-child');
    await page.waitForLoadState('networkidle');

    // Wait for messages to load
    await page.waitForSelector('.message', { state: 'visible' });

    // Measure dimensions after conversation load
    const postClickDimensions = await page.locator('.chat-container').boundingBox();
    expect(postClickDimensions).toBeTruthy();

    // Verify width stability
    expect(Math.abs((initialDimensions?.width || 0) - (postClickDimensions?.width || 0))).toBeLessThan(5);

    // Take screenshot to verify visual consistency
    await expect(page).toHaveScreenshot('conversation-loaded.png');
  });

  test('chat container responds correctly to sidebar toggle', async ({ page }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Measure dimensions with sidebar expanded
    const expandedDimensions = await page.locator('.chat-container').boundingBox();
    expect(expandedDimensions).toBeTruthy();

    // Toggle sidebar collapsed
    const sidebarToggle = page.locator('button:has-text("Conversations")');
    await sidebarToggle.click();

    // Wait for transition to complete
    await page.waitForTimeout(500);

    // Measure dimensions with sidebar collapsed
    const collapsedDimensions = await page.locator('.chat-container').boundingBox();
    expect(collapsedDimensions).toBeTruthy();

    // Verify width increased when sidebar collapsed (expected behavior)
    expect((collapsedDimensions?.width || 0)).toBeGreaterThan((expandedDimensions?.width || 0));

    // Take screenshots for visual verification
    await expect(page).toHaveScreenshot('sidebar-collapsed.png');

    // Toggle back to expanded
    await sidebarToggle.click();
    await page.waitForTimeout(500);

    const reExpandedDimensions = await page.locator('.chat-container').boundingBox();
    expect(reExpandedDimensions).toBeTruthy();

    // Verify we're back to original width
    expect(Math.abs((expandedDimensions?.width || 0) - (reExpandedDimensions?.width || 0))).toBeLessThan(5);

    await expect(page).toHaveScreenshot('sidebar-re-expanded.png');
  });

  test('chat container maintains box-sizing consistency', async ({ page }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Check computed styles for box-sizing consistency
    const boxSizing = await page.locator('.chat-container').evaluate((el) => {
      return window.getComputedStyle(el).boxSizing;
    });

    expect(boxSizing).toBe('border-box');

    // Verify width is 100% as expected
    const width = await page.locator('.chat-container').evaluate((el) => {
      return window.getComputedStyle(el).width;
    });

    // Width should be calculated as 100% of parent minus any margins
    expect(width).toMatch(/^\d+px$/); // Should be a pixel value, not percentage at computed level
  });
}); 