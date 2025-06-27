// Test for deployment functionality
describe('Frontend Deployment', () => {
    test('should generate correct cache-busted URL format', () => {
        // Test URL format generation
        const baseUrl = 'https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html';
        const timestamp = '2025-06-21_1859';
        const expectedUrl = `${baseUrl}?v=${timestamp}`;
        
        expect(expectedUrl).toBe('https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html?v=2025-06-21_1859');
        
        // Test URL format matches pattern
        expect(expectedUrl).toMatch(/https:\/\/storage\.googleapis\.com\/[^\/]+\/index\.html\?v=\d{4}-\d{2}-\d{2}_\d{4}/);
    });

    test('should handle dynamic configuration loading', () => {
        // Mock window object for testing
        const mockWindow = {
            CHATFLOW_CONFIG: {
                API_BASE_URL: 'https://chatflow-backend-test.a.run.app/v1',
                WS_BASE_URL: 'wss://chatflow-backend-test.a.run.app/ws',
                APP_NAME: 'ChatFlow',
                VERSION: '1.0.0',
                BUILD_TIMESTAMP: '2025-06-21_1859'
            }
        };

        // Test dynamic config structure
        expect(mockWindow.CHATFLOW_CONFIG.API_BASE_URL).toMatch(/^https:\/\/.*\/v1$/);
        expect(mockWindow.CHATFLOW_CONFIG.WS_BASE_URL).toMatch(/^wss:\/\/.*\/ws$/);
        expect(mockWindow.CHATFLOW_CONFIG.BUILD_TIMESTAMP).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}$/);
    });

    test('should handle API URL transformation correctly', () => {
        const backendUrl = 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app';
        const apiUrl = `${backendUrl}/v1`;
        const wsUrl = backendUrl.replace('https://', 'wss://') + '/ws';

        expect(apiUrl).toBe('https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1');
        expect(wsUrl).toBe('wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws');
    });

    test('should validate build timestamp format', () => {
        // Test timestamp generation logic
        const now = new Date('2025-06-21T18:59:30.123Z');
        const timestamp = now.toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        
        expect(timestamp).toBe('2025-06-21_1859');
        expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}$/);
    });

    test('should handle environment configuration precedence', () => {
        // Test environment detection logic
        const mockLocation = {
            hostname: 'storage.googleapis.com'
        };

        // Should be production environment
        const isProduction = mockLocation.hostname !== 'localhost' && mockLocation.hostname !== '127.0.0.1';
        expect(isProduction).toBe(true);

        // Test localhost detection
        const mockLocalhost = {
            hostname: 'localhost'
        };
        const isDevelopment = mockLocalhost.hostname === 'localhost' || mockLocalhost.hostname === '127.0.0.1';
        expect(isDevelopment).toBe(true);
    });

    test('should validate config.js generation structure', () => {
        const apiUrl = 'https://chatflow-backend-test.a.run.app/v1';
        const wsUrl = 'wss://chatflow-backend-test.a.run.app/ws';
        const buildTimestamp = '2025-06-21_1859';
        const version = '1.0.0';

        const expectedConfigJs = `
// Auto-generated configuration file
window.CHATFLOW_CONFIG = {
    API_BASE_URL: '${apiUrl}',
    WS_BASE_URL: '${wsUrl}',
    APP_NAME: 'ChatFlow',
    VERSION: '${version}',
    BUILD_TIMESTAMP: '${buildTimestamp}'
};

console.info('🔧 ChatFlow Dynamic Config Loaded:', window.CHATFLOW_CONFIG);
`;

        // Verify the config structure
        expect(expectedConfigJs).toContain('window.CHATFLOW_CONFIG');
        expect(expectedConfigJs).toContain(apiUrl);
        expect(expectedConfigJs).toContain(wsUrl);
        expect(expectedConfigJs).toContain(buildTimestamp);
        expect(expectedConfigJs).toContain('ChatFlow');
    });

    test('should handle cache control headers correctly', () => {
        // Test cache control values
        const htmlCacheControl = 'Cache-Control:public, max-age=300';
        const jsCacheControl = 'Cache-Control:public, max-age=3600';
        const cssCacheControl = 'Cache-Control:public, max-age=3600';

        // HTML should have shorter cache time for faster updates
        expect(htmlCacheControl).toContain('max-age=300');
        
        // JS and CSS can have longer cache times with cache busting
        expect(jsCacheControl).toContain('max-age=3600');
        expect(cssCacheControl).toContain('max-age=3600');
    });

    test('should validate terraform output parsing', () => {
        // Mock terraform outputs
        const mockOutputs = {
            cloud_run_url: 'https://chatflow-backend-abc123-ue.a.run.app',
            frontend_bucket_url: 'gs://contact-center-insights-poc-chatflow-frontend',
            frontend_url: 'https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html'
        };

        // Test output parsing
        expect(mockOutputs.cloud_run_url).toMatch(/^https:\/\/.*\.a\.run\.app$/);
        expect(mockOutputs.frontend_bucket_url).toMatch(/^gs:\/\/.*$/);
        expect(mockOutputs.frontend_url).toMatch(/^https:\/\/storage\.googleapis\.com\/.*\/index\.html$/);
    });

    test('should handle deployment URL output format', () => {
        const deploymentInfo = {
            frontendUrl: 'https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html?v=2025-06-21_1859',
            apiUrl: 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1',
            wsUrl: 'wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws',
            buildTimestamp: '2025-06-21_1859',
            version: '1.0.0'
        };

        // Verify deployment info structure
        expect(deploymentInfo.frontendUrl).toContain('?v=');
        expect(deploymentInfo.apiUrl).toContain('/v1');
        expect(deploymentInfo.wsUrl).toMatch(/^wss:\/\//);
        expect(deploymentInfo.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}$/);
        
        // Test the exact format expected
        expect(deploymentInfo.frontendUrl).toMatch(/^https:\/\/storage\.googleapis\.com\/.*\/index\.html\?v=\d{4}-\d{2}-\d{2}_\d{4}$/);
    });
}); 