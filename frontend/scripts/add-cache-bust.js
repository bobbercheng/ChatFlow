const fs = require('fs');
const path = require('path');

// Generate build timestamp
const buildTimestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '_').slice(0, 15);
console.log(`🕒 Generated build timestamp: ${buildTimestamp}`);

// Function to replace BUILD_TIMESTAMP in a file
function replaceBuildTimestamp(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const updatedContent = content.replace(/BUILD_TIMESTAMP/g, buildTimestamp);
    
    if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`✅ Updated cache busting in: ${filePath}`);
    } else {
        console.log(`ℹ️  No BUILD_TIMESTAMP placeholders found in: ${filePath}`);
    }
}

// Function to add cache busting to JavaScript imports in a file
function addCacheBustToImports(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Add timestamp to .js imports that don't already have query parameters
    const updatedContent = content.replace(
        /from ['"]([^'"]+\.js)['"]/g,
        (match, importPath) => {
            if (importPath.includes('?')) {
                return match; // Already has query parameters
            }
            return `from '${importPath}?v=${buildTimestamp}'`;
        }
    );
    
    if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent);
        console.log(`✅ Added cache busting to imports in: ${filePath}`);
    } else {
        console.log(`ℹ️  No imports to update in: ${filePath}`);
    }
}

// Main execution
console.log('🚀 Starting cache busting process...');

// Update HTML files
const distDir = path.join(__dirname, '..', 'dist');
const htmlFiles = ['index.html'];

htmlFiles.forEach(filename => {
    const filePath = path.join(distDir, filename);
    replaceBuildTimestamp(filePath);
});

// Update JavaScript files to add cache busting to their imports
const jsFiles = ['app.js'];

jsFiles.forEach(filename => {
    const filePath = path.join(distDir, filename);
    addCacheBustToImports(filePath);
});

// Create a build info file
const buildInfo = {
    buildTimestamp,
    buildDate: new Date().toISOString(),
    version: require('../package.json').version
};

fs.writeFileSync(
    path.join(distDir, 'build-info.json'),
    JSON.stringify(buildInfo, null, 2)
);

console.log('✅ Cache busting process completed!');
console.log(`📝 Build info saved to dist/build-info.json`);
console.log(`🏷️  Build version: ${buildTimestamp}`); 