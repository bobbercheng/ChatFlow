interface EnvironmentConfig {
    API_BASE_URL: string;
    WS_BASE_URL: string;
    APP_NAME: string;
    VERSION: string;
}

// Environment detection
const getEnvironment = (): 'development' | 'production' | 'custom' => {
    // Check if running on localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'development';
    }
    
    // Check for custom configuration
    if ((window as any).CHATFLOW_CONFIG) {
        return 'custom';
    }
    
    return 'production';
};

// Default configurations for different environments
const environments: Record<string, EnvironmentConfig> = {
    development: {
        // API_BASE_URL: 'http://localhost:3002/v1',
        // WS_BASE_URL: 'ws://localhost:3002/ws',
        API_BASE_URL: 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1',
        WS_BASE_URL: 'wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws',
        APP_NAME: 'ChatFlow (Dev)',
        VERSION: '1.0.0-dev'
    },
    production: {
        API_BASE_URL: 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1',
        WS_BASE_URL: 'wss://chatflow-backend-3w6u4kmniq-ue.a.run.app/ws',
        APP_NAME: 'ChatFlow',
        VERSION: '1.0.0'
    },
    custom: {
        API_BASE_URL: '',
        WS_BASE_URL: '',
        APP_NAME: 'ChatFlow',
        VERSION: '1.0.0'
    }
};

// Get current environment configuration
const getCurrentConfig = (): EnvironmentConfig => {
    const env = getEnvironment();
    
    if (env === 'custom') {
        const customConfig = (window as any).CHATFLOW_CONFIG;
        return {
            ...environments.custom,
            API_BASE_URL: customConfig.API_BASE_URL || environments.production.API_BASE_URL,
            WS_BASE_URL: customConfig.WS_BASE_URL || environments.production.WS_BASE_URL,
            APP_NAME: customConfig.APP_NAME || environments.custom.APP_NAME,
            VERSION: customConfig.VERSION || environments.custom.VERSION
        };
    }
    
    return environments[env];
};

export const config = getCurrentConfig();

// Debug logging in development
if (getEnvironment() === 'development') {
    console.log('🔧 ChatFlow Configuration:', config);
}

// Allow runtime configuration override
declare global {
    interface Window {
        CHATFLOW_CONFIG?: Partial<EnvironmentConfig>;
        setChatFlowConfig?: (newConfig: Partial<EnvironmentConfig>) => void;
    }
}

// Expose configuration function globally for runtime changes
window.setChatFlowConfig = (newConfig: Partial<EnvironmentConfig>) => {
    Object.assign((window as any).CHATFLOW_CONFIG = (window as any).CHATFLOW_CONFIG || {}, newConfig);
    window.location.reload(); // Reload to apply new configuration
}; 