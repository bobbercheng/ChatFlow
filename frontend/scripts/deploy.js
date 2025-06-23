#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
    log(`❌ [ERROR] ${message}`, 'red');
}

function success(message) {
    log(`✅ [SUCCESS] ${message}`, 'green');
}

function info(message) {
    log(`ℹ️ [INFO] ${message}`, 'blue');
}

function warning(message) {
    log(`⚠️ [WARNING] ${message}`, 'yellow');
}

// Main deployment function
async function deployFrontend() {
    try {
        log('🚀 ChatFlow Frontend Deployment', 'cyan');
        log('================================', 'cyan');
        
        // Step 1: Get backend URL from terraform
        info('Getting backend API URL from terraform...');
        let backendUrl;
        let bucketUrl;
        let frontendBaseUrl;
        
        try {
            // Check if we're in the correct directory structure
            const terraformDir = path.join(__dirname, '..', '..', 'terraform');
            if (!fs.existsSync(terraformDir)) {
                throw new Error('Terraform directory not found. Make sure you run this from the project root.');
            }
            
            // Get terraform outputs
            const cloudRunOutput = execSync('terraform output -raw cloud_run_url', { 
                cwd: terraformDir, 
                encoding: 'utf8' 
            }).trim();
            
            const bucketOutput = execSync('terraform output -raw frontend_bucket_url', { 
                cwd: terraformDir, 
                encoding: 'utf8' 
            }).trim();
            
            const frontendOutput = execSync('terraform output -raw frontend_url', { 
                cwd: terraformDir, 
                encoding: 'utf8' 
            }).trim();
            
            backendUrl = cloudRunOutput;
            bucketUrl = bucketOutput;
            frontendBaseUrl = frontendOutput;
            
            success(`Backend URL: ${backendUrl}`);
            success(`Frontend bucket: ${bucketUrl}`);
            success(`Frontend base URL: ${frontendBaseUrl}`);
            
        } catch (err) {
            warning('Could not get terraform outputs. Using fallback configuration.');
            warning('Make sure terraform has been applied first.');
            
            // Fallback configuration
            backendUrl = 'https://chatflow-backend-3w6u4kmniq-ue.a.run.app';
            bucketUrl = 'gs://contact-center-insights-poc-chatflow-frontend';
            frontendBaseUrl = 'https://storage.googleapis.com/contact-center-insights-poc-chatflow-frontend/index.html';
        }
        
        // Step 2: Update frontend configuration
        info('Updating frontend configuration...');
        const configPath = path.join(__dirname, '..', 'src', 'config', 'environment.ts');
        let configContent = fs.readFileSync(configPath, 'utf8');
        
        // Update the production API URLs
        const apiUrl = `${backendUrl}/v1`;
        const wsUrl = backendUrl.replace('https://', 'wss://') + '/ws';
        
        configContent = configContent.replace(
            /API_BASE_URL: 'https:\/\/[^']+'/,
            `API_BASE_URL: '${apiUrl}'`
        );
        
        configContent = configContent.replace(
            /WS_BASE_URL: 'wss:\/\/[^']+'/,
            `WS_BASE_URL: '${wsUrl}'`
        );
        
        fs.writeFileSync(configPath, configContent);
        success('Frontend configuration updated with new API URLs');
        
        // Step 3: Build frontend with Vite (includes automatic cache busting)
        info('Building frontend with Vite...');
        execSync('npm run build', { 
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit' 
        });
        success('Frontend built successfully');
        
        // Step 4: Get version and create build info (Vite doesn't generate build-info.json)
        const packageJsonPath = path.join(__dirname, '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const buildTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
        const buildInfo = {
            version: packageJson.version,
            buildTimestamp,
            buildDate: new Date().toISOString()
        };
        
        info(`Version: ${buildInfo.version}`);
        
        // Step 5: Create dynamic config.js file
        info('Creating dynamic configuration file...');
        const dynamicConfig = `
// Auto-generated configuration file
window.CHATFLOW_CONFIG = {
    API_BASE_URL: '${apiUrl}',
    WS_BASE_URL: '${wsUrl}',
    APP_NAME: 'ChatFlow',
    VERSION: '${buildInfo.version}',
    BUILD_TIMESTAMP: '${buildTimestamp}'
};

console.log('🔧 ChatFlow Dynamic Config Loaded:', window.CHATFLOW_CONFIG);
`;
        
        const configJsPath = path.join(__dirname, '..', 'dist', 'config.js');
        fs.writeFileSync(configJsPath, dynamicConfig);
        success('Dynamic configuration file created');
        
        // Step 6: Upload to Google Cloud Storage
        info('Uploading to Google Cloud Storage...');
        
        try {
            // Upload all files (with overwrite to handle Terraform-uploaded files)
            execSync(`gsutil -m cp -r dist/* ${bucketUrl}/`, {
                cwd: path.join(__dirname, '..'),
                stdio: 'inherit'
            });
            
            // Set proper cache control headers for different file types
            // HTML files - short cache (5 minutes) for content updates
            execSync(`gsutil -m setmeta -h "Cache-Control:public, max-age=300" ${bucketUrl}/*.html`, {
                stdio: 'inherit'
            });
            
            // Config files - short cache (5 minutes) for dynamic configuration
            execSync(`gsutil -m setmeta -h "Cache-Control:public, max-age=300" ${bucketUrl}/config.js`, {
                stdio: 'inherit'
            });
            
            // Static assets - long cache (1 hour) since they have cache-busting hashes
            try {
                // Check if assets directory exists before setting headers
                execSync(`gsutil ls ${bucketUrl}/assets/ > /dev/null 2>&1`, {
                    stdio: 'pipe'
                });
                execSync(`gsutil -m setmeta -h "Cache-Control:public, max-age=3600" ${bucketUrl}/assets/*`, {
                    stdio: 'inherit'
                });
                success('Cache headers set for static assets');
            } catch (assetError) {
                warning('Could not set cache headers for assets (assets may not exist or command failed)');
                info('This is non-critical - files are still uploaded successfully');
            }
            
        } catch (uploadError) {
            error('Failed to upload to Google Cloud Storage');
            error('Make sure you are authenticated with gcloud and have proper permissions');
            error(`Upload error details: ${uploadError.message}`);
            throw uploadError;
        }
        
        success('Files uploaded to Google Cloud Storage');
        
        // Step 7: Construct final URL with cache busting
        const finalUrl = `${frontendBaseUrl}?v=${buildTimestamp}`;
        
        // Step 8: Test deployment
        info('Testing deployment...');
        try {
            execSync(`curl -I "${finalUrl}"`, { stdio: 'inherit' });
            success('Deployment test successful');
        } catch (testError) {
            warning('Deployment test failed, but files may still be uploading');
        }
        
        // Step 9: Output final information
        log('\n🎉 Frontend Deployment Complete!', 'green');
        log('================================', 'green');
        log(`📱 Frontend URL: ${finalUrl}`, 'cyan');
        log(`🔧 API URL: ${apiUrl}`, 'cyan');
        log(`🔌 WebSocket URL: ${wsUrl}`, 'cyan');
        log(`🕒 Build Timestamp: ${buildTimestamp}`, 'cyan');
        log(`📦 Version: ${buildInfo.version}`, 'cyan');
        
        // Output for CI/CD or automation
        console.log('\n--- DEPLOYMENT INFO ---');
        console.log(`FRONTEND_URL=${finalUrl}`);
        console.log(`API_URL=${apiUrl}`);
        console.log(`WS_URL=${wsUrl}`);
        console.log(`BUILD_TIMESTAMP=${buildTimestamp}`);
        console.log(`VERSION=${buildInfo.version}`);
        console.log('--- END DEPLOYMENT INFO ---');
        
        return {
            frontendUrl: finalUrl,
            apiUrl,
            wsUrl,
            buildTimestamp,
            version: buildInfo.version
        };
        
    } catch (err) {
        error(`Deployment failed: ${err.message}`);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
ChatFlow Frontend Deployment Script

Usage: node scripts/deploy.js [options]

Options:
  --help, -h     Show this help message
  --build-only   Build frontend only (no upload)
  --upload-only  Upload only (skip build)

Environment:
  Requires terraform to be applied first to get backend URLs
  Requires gcloud authentication for Google Cloud Storage upload

Examples:
  node scripts/deploy.js              # Full deployment
  node scripts/deploy.js --build-only # Build only
  node scripts/deploy.js --upload-only # Upload only
`);
    process.exit(0);
}

if (args.includes('--build-only')) {
    log('🔨 Building frontend only...', 'yellow');
    execSync('npm run build', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
    });
    success('Build completed');
    process.exit(0);
}

if (args.includes('--upload-only')) {
    log('📤 Uploading frontend only...', 'yellow');
    // Implementation for upload-only would go here
    warning('Upload-only mode not fully implemented yet');
    process.exit(1);
}

// Run deployment if called directly
if (require.main === module) {
    deployFrontend().catch(err => {
        error(`Fatal error: ${err.message}`);
        process.exit(1);
    });
}

module.exports = { deployFrontend }; 