import { test, expect } from '@playwright/test';

test.describe('wasm-git OPFS example', () => {
    test('demo completes all steps successfully', async ({ page }) => {
        // Collect console errors for better failure diagnostics
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto('/examples/opfs/');

        // Wait for the demo to finish (success or error element appears)
        await page.waitForSelector('#demo-complete, #demo-error', { timeout: 60000 });

        if (errors.length) {
            console.log('Console errors:', errors);
        }

        // Assert the demo completed successfully, not with an error
        const statusEl = page.locator('#demo-complete');
        await expect(statusEl).toBeVisible();
        await expect(statusEl).toHaveText('All operations completed successfully!');

        // All individual steps should be marked as success
        const steps = page.locator('[data-status]');
        const count = await steps.count();
        for (let i = 0; i < count; i++) {
            await expect(steps.nth(i)).toHaveAttribute('data-status', 'success');
        }
    });
});
