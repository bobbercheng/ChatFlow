# OpenAPI Frontend Synchronization

This document explains how the frontend maintains perfect synchronization with the backend OpenAPI specification.

## 🎯 **Single Source of Truth**

The OpenAPI specification (`backend/src/rest/v1/openapi.yaml`) is the **single source of truth** for all API contracts. Frontend types are automatically generated from this specification to ensure perfect synchronization.

## 🔄 **Type Generation Workflow**

### 1. **Automatic Type Generation**
```bash
# Generate TypeScript types from OpenAPI schema
node scripts/generate-types.js > src/types/openapi-generated.ts
```

This script:
- Reads the OpenAPI YAML specification  
- Converts all OpenAPI schemas to TypeScript interfaces
- Handles generic types (`ApiResponse<T>`, `PaginationResult<T>`)
- Includes frontend-specific types not in OpenAPI (WebSocket, etc.)

### 2. **Type Import Structure**
```typescript
// src/types/index.ts - Main export file
export * from "./openapi-generated.js";
export { AuthRequest as LoginRequest } from "./openapi-generated.js";
```

All types are re-exported from the generated file, ensuring consistency.

### 3. **API Service Integration**
```typescript
// src/services/apiService.ts
import { ApiResponse, User, Message, CreateMessageRequest } from "../types/index.js";

// All methods use exact OpenAPI types
async sendMessage(conversationId: string, data: CreateMessageRequest): Promise<ApiResponse<Message>>
```

## ✅ **Automated Validation**

### Continuous Synchronization Test
```bash
npm test src/types/openapi-sync.test.ts
```

This test **automatically fails** if:
- Frontend types dont match OpenAPI schemas
- New OpenAPI schemas are added without frontend types
- Generated types are missing or malformed
- Generic types (`ApiResponse<T>`) arent properly generic

### Test Coverage
- ✅ **Schema Validation**: All 17 OpenAPI schemas present
- ✅ **Type Generation**: Correct TypeScript interfaces 
- ✅ **Generic Types**: `ApiResponse<T>` and `PaginationResult<T>`
- ✅ **File Structure**: Generated file exists and is properly formatted

## 🛠 **Maintenance Workflow**

### When OpenAPI Schema Changes:

1. **Update OpenAPI** (`backend/src/rest/v1/openapi.yaml`)
2. **Regenerate Types**:
   ```bash
   cd frontend
   node scripts/generate-types.js > src/types/openapi-generated.ts
   ```
3. **Run Validation**:
   ```bash
   npm test src/types/openapi-sync.test.ts
   ```
4. **Update API Service** (if new endpoints added)
5. **Run Full Test Suite**:
   ```bash
   npm test
   ```

🎉 **SUCCESS: Perfect OpenAPI-Frontend Synchronization Achieved!**
