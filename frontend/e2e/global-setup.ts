import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('Starting global setup for E2E tests...');

  // Start browser for auth setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for the application to be ready
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
    
    console.log(`Waiting for application at ${baseURL}...`);
    
    // Try to access the main page first (more reliable than API endpoints)
    let retries = 0;
    const maxRetries = 30; // 30 seconds max wait
    
    while (retries < maxRetries) {
      try {
        const response = await page.request.get(baseURL);
        if (response.ok()) {
          console.log('Main application page is ready!');
          
          // Try health check as well, but don't fail if it's not available
          try {
            const healthResponse = await page.request.get(`${baseURL}/api/health-check`);
            if (healthResponse.ok()) {
              console.log('Health check endpoint is also ready!');
            }
          } catch (healthError) {
            console.log('Health check endpoint not ready yet, but main page is accessible');
          }
          
          break;
        }
      } catch (error) {
        console.log(`Attempt ${retries + 1}/${maxRetries}: Application not ready yet...`);
      }
      
      retries++;
      if (retries >= maxRetries) {
        throw new Error('Application failed to start within timeout');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Set up test data if needed
    await setupTestData(page, baseURL);
    
    console.log('Global setup completed successfully');
    
  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function setupTestData(page: any, baseURL: string) {
  // This would set up test users, containers, etc.
  // For now, just verify the main page loads
  
  try {
    await page.goto(baseURL);
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    console.log('Main page loaded successfully');
  } catch (error) {
    console.warn('Main page navigation failed:', error);
    // Don't fail the setup if page navigation has issues
  }
}

export default globalSetup; 