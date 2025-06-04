import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('Starting global teardown for E2E tests...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
    
    // Clean up test data
    await cleanupTestData(page, baseURL);
    
    console.log('Global teardown completed successfully');
    
  } catch (error) {
    console.error('Global teardown failed:', error);
    // Don't throw error in teardown to avoid masking test failures
  } finally {
    await browser.close();
  }
}

async function cleanupTestData(page: any, baseURL: string) {
  // This would clean up test users, containers, etc.
  // For now, just log the cleanup attempt
  
  try {
    console.log('Cleaning up test data...');
    
    // In a real implementation, you might:
    // - Delete test containers
    // - Clean up test users
    // - Reset database state
    // - Clear logs
    
    console.log('Test data cleanup completed');
  } catch (error) {
    console.warn('Test data cleanup failed:', error);
  }
}

export default globalTeardown; 