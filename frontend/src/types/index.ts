// Export all OpenAPI-generated types as the single source of truth
export * from './openapi-generated.js';

// Re-export with aliases for backward compatibility  
export { AuthRequest as LoginRequest } from './openapi-generated.js'; 