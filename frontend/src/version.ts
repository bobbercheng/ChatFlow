/**
 * Version Display Module
 * Handles displaying the frontend version in the footer
 */

// Build-time version injected by Vite
const BUILD_VERSION = __FRONTEND_VERSION__;

/**
 * Update the version display in the footer
 */
export function updateVersionDisplay(): void {
  const versionSpan = document.getElementById('frontend-version');
  if (versionSpan) {
    let version = BUILD_VERSION; // Default to build-time version
    
    // Try to get version from config first (set by Terraform)
    if (window.CHATFLOW_CONFIG && window.CHATFLOW_CONFIG.VERSION) {
      version = window.CHATFLOW_CONFIG.VERSION;
    }
    
    versionSpan.textContent = version;
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initial version display
  updateVersionDisplay();
  
  // Update version when config loads
  setTimeout(updateVersionDisplay, 100);
});

// Make function globally available for config loading
(window as any).updateVersionDisplay = updateVersionDisplay; 