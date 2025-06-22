const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Load OpenAPI spec
function loadOpenAPISpec() {
  const openApiPath = path.join(__dirname, '../../backend/src/rest/v1/openapi.yaml');
  const content = fs.readFileSync(openApiPath, 'utf-8');
  return yaml.load(content);
}

// Convert OpenAPI type to TypeScript type string
function openApiTypeToTypeScript(property, schemas) {
  if (property.$ref) {
    const refName = property.$ref.split('/').pop();
    return refName || 'unknown';
  }

  if (property.type === 'string') {
    if (property.enum) {
      return property.enum.map(e => `'${e}'`).join(' | ');
    }
    return 'string';
  }

  if (property.type === 'number' || property.type === 'integer') {
    return 'number';
  }

  if (property.type === 'boolean') {
    return 'boolean';
  }

  if (property.type === 'array') {
    if (property.items) {
      const itemType = openApiTypeToTypeScript(property.items, schemas);
      return `${itemType}[]`;
    }
    return 'any[]';
  }

  if (property.type === 'object') {
    if (property.properties) {
      const props = Object.entries(property.properties)
        .map(([key, prop]) => {
          const isOptional = !(property.required?.includes(key));
          const propType = openApiTypeToTypeScript(prop, schemas);
          return `${key}${isOptional ? '?' : ''}: ${propType}`;
        });
      return `{ ${props.join('; ')} }`;
    }
    return 'any';
  }

  return 'any';
}

// Generate TypeScript interface from OpenAPI schema
function generateTypeScriptInterface(name, schema, schemas) {
  if (schema.allOf) {
    const interfaces = [];
    const additionalProps = [];
    
    for (const item of schema.allOf) {
      if (item.$ref) {
        const refName = item.$ref.split('/').pop();
        if (refName) {
          interfaces.push(refName);
        }
      } else if (item.properties) {
        Object.entries(item.properties).forEach(([key, prop]) => {
          const isOptional = !(item.required?.includes(key));
          const propType = openApiTypeToTypeScript(prop, schemas);
          additionalProps.push(`  ${key}${isOptional ? '?' : ''}: ${propType};`);
        });
      }
    }
    
    if (interfaces.length > 0 && additionalProps.length > 0) {
      return `export interface ${name} extends ${interfaces.join(', ')} {\n${additionalProps.join('\n')}\n}`;
    } else if (interfaces.length > 0) {
      return `export interface ${name} extends ${interfaces.join(', ')} {}`;
    } else {
      return `export interface ${name} {\n${additionalProps.join('\n')}\n}`;
    }
  }

  if (!schema.properties) {
    return `export interface ${name} {\n  [key: string]: any;\n}`;
  }

  const properties = Object.entries(schema.properties).map(([key, property]) => {
    const isOptional = !(schema.required?.includes(key)) && !property.nullable;
    const propType = openApiTypeToTypeScript(property, schemas);
    const nullableType = property.nullable ? ` | null` : '';
    return `  ${key}${isOptional ? '?' : ''}: ${propType}${nullableType};`;
  });

  return `export interface ${name} {\n${properties.join('\n')}\n}`;
}

// Main function
function main() {
  const openApiSpec = loadOpenAPISpec();
  const schemas = openApiSpec.components?.schemas || {};
  
  console.log('// Generated from OpenAPI schema - DO NOT EDIT MANUALLY');
  console.log('// Run: node scripts/generate-types.js > src/types/openapi-generated.ts\n');
  
  // Generate types in dependency order
  const schemaOrder = [
    'ConversationParticipant',
    'User', 
    'Conversation',
    'Message',
    'PaginationResult',
    'ApiResponse',
    'ErrorResponse',
    'AuthRequest',
    'RegisterRequest',
    'CreateConversationRequest', 
    'CreateMessageRequest',
    'UpdateMessageRequest',
    'SearchResult',
    'SearchResponse',
    'SearchSuggestion',
    'ClickTrackingRequest',
    'IndexMessageRequest'
  ];
  
  schemaOrder.forEach(name => {
    if (schemas[name]) {
      let interfaceDefinition = generateTypeScriptInterface(name, schemas[name], schemas);
      
      // Special handling for ApiResponse to make it generic
      if (name === 'ApiResponse') {
        interfaceDefinition = interfaceDefinition.replace(
          'export interface ApiResponse {',
          'export interface ApiResponse<T = any> {'
        ).replace(
          'data?: any;',
          'data?: T;'
        );
      }
      
      // Special handling for PaginationResult to make it generic  
      if (name === 'PaginationResult') {
        interfaceDefinition = interfaceDefinition.replace(
          'export interface PaginationResult {',
          'export interface PaginationResult<T = any> {'
        ).replace(
          'data?: any[];',
          'data?: T[];'
        );
      }
      
      console.log(interfaceDefinition);
      console.log('');
    }
  });
  
  // Add frontend-specific types that are not in OpenAPI
  console.log('// Frontend-specific types (not in OpenAPI schema)');
  console.log('export interface PaginationParams {');
  console.log('  page?: number;');
  console.log('  limit?: number;');
  console.log('}');
  console.log('');
  
  console.log('export interface LoginResponse {');
  console.log('  user: User;');
  console.log('  token: string;');
  console.log('}');
  console.log('');
  
  console.log('export interface WebSocketMessage {');
  console.log('  type: \'message\' | \'typing\' | \'user_status\' | \'error\';');
  console.log('  payload: any;');
  console.log('  timestamp: string;');
  console.log('}');
  console.log('');
  
  console.log('export interface WebSocketEvent {');
  console.log('  type: \'connection\' | \'message:new\' | \'message:status\' | \'message:created\' | \'error\' | \'echo\';');
  console.log('  payload: any;');
  console.log('  timestamp: string;');
  console.log('}');
}

main(); 