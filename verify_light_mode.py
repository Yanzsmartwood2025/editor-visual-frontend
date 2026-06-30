import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Navigate to the local app
        await page.goto("http://localhost:3000")

        # Wait for hydration
        await page.wait_for_timeout(2000)

        # Take initial Dark mode screenshot
        await page.screenshot(path="verification/screenshots/dark_mode_before.png", full_page=True)

        # Click the theme toggle using get_by_role which is more robust
        theme_button = page.get_by_role("button", name="Modo Claro")

        # Try finding by title if role fails (fallback)
        if not await theme_button.is_visible():
             theme_button = page.locator('button[title="Modo Claro"]')

        await theme_button.click()

        # Wait for state to change and re-render
        await page.wait_for_timeout(1000)

        # Take light mode screenshot
        await page.screenshot(path="verification/screenshots/light_mode_after.png", full_page=True)

        await browser.close()

asyncio.run(main())
