import { test, expect } from '@playwright/test';

test.describe('CSS Specificity and Layout Rules', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.chat-app', { state: 'visible' });
    await page.waitForLoadState('networkidle');
  });

  test('chat container specificity rules are consistent', async ({ page }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Get all CSS rules affecting .chat-container
    const cssRules = await page.evaluate(() => {
      const chatContainer = document.querySelector('.chat-container');
      if (!chatContainer) return { rules: [], computedStyles: {} };

      const styles = window.getComputedStyle(chatContainer);
      const rules: Array<{selector: string, padding: string, width: string, boxSizing: string}> = [];

      // Get all stylesheets
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSStyleRule) {
              // Check if rule affects .chat-container
              if (rule.selectorText && 
                  (rule.selectorText.includes('.chat-container') || 
                   rule.selectorText.includes('chat-container'))) {
                rules.push({
                  selector: rule.selectorText,
                  padding: rule.style.padding,
                  width: rule.style.width,
                  boxSizing: rule.style.boxSizing
                });
              }
            }
          }
        } catch (e) {
          // Skip external stylesheets we can't access
        }
      }

      return {
        rules,
        computedStyles: {
          padding: styles.padding,
          width: styles.width,
          boxSizing: styles.boxSizing,
          paddingLeft: styles.paddingLeft,
          paddingRight: styles.paddingRight
        }
      };
    });

    // Verify box-sizing is consistently border-box
    expect(cssRules.computedStyles.boxSizing).toBe('border-box');

    // Log rules for debugging (helpful for future issues)
    console.log('CSS Rules affecting .chat-container:', cssRules.rules);

    // Verify no conflicting width values
    const widthRules = cssRules.rules.filter(rule => rule.width && rule.width !== '');
    if (widthRules.length > 1) {
      // All width rules should be 100% or auto for consistency
      for (const rule of widthRules) {
        expect(['100%', 'auto'].includes(rule.width)).toBeTruthy();
      }
    }
  });

  test('responsive breakpoints maintain consistent layout', async ({ page, viewport }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Test different viewport sizes
    const viewports = [
      { width: 1920, height: 1080, name: 'Desktop Large' },
      { width: 1280, height: 720, name: 'Desktop Standard' },
      { width: 1024, height: 768, name: 'Tablet' },
      { width: 768, height: 1024, name: 'Mobile Large' },
      { width: 375, height: 667, name: 'Mobile Standard' }
    ];

    const results: Array<{
      viewport: string;
      dimensions: { x: number; y: number; width: number; height: number; } | null;
      styles: { padding: string; paddingLeft: string; paddingRight: string; width: string; boxSizing: string; };
    }> = [];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // Allow layout to settle

      const dimensions = await page.locator('.chat-container').boundingBox();
      const computedStyles = await page.locator('.chat-container').evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return {
          padding: styles.padding,
          paddingLeft: styles.paddingLeft,
          paddingRight: styles.paddingRight,
          width: styles.width,
          boxSizing: styles.boxSizing
        };
      });

      results.push({
        viewport: viewport.name,
        dimensions,
        styles: computedStyles
      });

      // Take screenshot for visual verification
      await expect(page).toHaveScreenshot(`responsive-${viewport.name.toLowerCase().replace(' ', '-')}.png`);
    }

    // Verify consistent box-sizing across all viewports
    for (const result of results) {
      expect(result.styles.boxSizing).toBe('border-box');
    }

    // Log results for debugging
    console.log('Responsive layout results:', results);
  });

  test('sidebar state changes do not cause layout shifts', async ({ page }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Start with expanded sidebar
    let initialDimensions = await page.locator('.chat-container').boundingBox();
    expect(initialDimensions).toBeTruthy();

    // Record initial position
    const initialLeft = initialDimensions?.x || 0;
    const initialWidth = initialDimensions?.width || 0;

    // Toggle to collapsed
    const sidebarToggle = page.locator('button:has-text("Conversations")');
    await sidebarToggle.click();
    await page.waitForTimeout(500);

    const collapsedDimensions = await page.locator('.chat-container').boundingBox();
    expect(collapsedDimensions).toBeTruthy();

    // Verify layout shift behavior
    const collapsedLeft = collapsedDimensions?.x || 0;
    const collapsedWidth = collapsedDimensions?.width || 0;

    // Container should move left and increase in width when sidebar collapses
    expect(collapsedLeft).toBeLessThan(initialLeft);
    expect(collapsedWidth).toBeGreaterThan(initialWidth);

    // Toggle back to expanded
    await sidebarToggle.click();
    await page.waitForTimeout(500);

    const reExpandedDimensions = await page.locator('.chat-container').boundingBox();
    expect(reExpandedDimensions).toBeTruthy();

    // Should return to original position
    expect(Math.abs((reExpandedDimensions?.x || 0) - initialLeft)).toBeLessThan(5);
    expect(Math.abs((reExpandedDimensions?.width || 0) - initialWidth)).toBeLessThan(5);
  });

  test('media query transitions are smooth', async ({ page }) => {
    await page.waitForSelector('.chat-container', { state: 'visible' });

    // Set to desktop size first
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);

    const desktopDimensions = await page.locator('.chat-container').boundingBox();

    // Gradually resize to trigger media query changes
    const sizes = [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 480, height: 640 },
      { width: 375, height: 667 }
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(300); // Allow transitions to complete

      const currentDimensions = await page.locator('.chat-container').boundingBox();
      expect(currentDimensions).toBeTruthy();

      // Verify the container is still visible and properly sized
      expect(currentDimensions?.width).toBeGreaterThan(100);
      expect(currentDimensions?.height).toBeGreaterThan(100);
    }
  });
}); 