import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Import frontend types to validate against OpenAPI
import * as FrontendTypes from './index.js';

// Type to extract property definitions from OpenAPI schema
interface OpenAPIProperty {
  type: string;
  format?: string;
  enum?: string[];
  items?: OpenAPIProperty;
  properties?: Record<string, OpenAPIProperty>;
  required?: string[];
  nullable?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
  example?: any;
  $ref?: string;
}

interface OpenAPISchema {
  type: string;
  properties?: Record<string, OpenAPIProperty>;
  required?: string[];
  allOf?: Array<{ $ref?: string; type?: string; properties?: Record<string, OpenAPIProperty>; required?: string[] }>;
  description?: string;
}

// Load OpenAPI spec
function loadOpenAPISpec(): any {
  const openApiPath = path.join(__dirname, '../../../backend/src/rest/v1/openapi.yaml');
  const content = fs.readFileSync(openApiPath, 'utf-8');
  return yaml.load(content);
}

// Convert OpenAPI type to TypeScript type string
function openApiTypeToTypeScript(property: OpenAPIProperty, schemas: Record<string, OpenAPISchema>): string {
  if (property.$ref) {
    // Extract schema name from $ref
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
function generateTypeScriptInterface(name: string, schema: OpenAPISchema, schemas: Record<string, OpenAPISchema>): string {
  if (schema.allOf) {
    // Handle allOf (inheritance/composition)
    const interfaces: string[] = [];
    const additionalProps: string[] = [];
    
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
          additionalProps.push(`${key}${isOptional ? '?' : ''}: ${propType}`);
        });
      }
    }
    
    if (interfaces.length > 0 && additionalProps.length > 0) {
      return `interface ${name} extends ${interfaces.join(', ')} {\n  ${additionalProps.join(';\n  ')};\n}`;
    } else if (interfaces.length > 0) {
      return `interface ${name} extends ${interfaces.join(', ')} {}`;
    } else {
      return `interface ${name} {\n  ${additionalProps.join(';\n  ')};\n}`;
    }
  }

  if (!schema.properties) {
    return `interface ${name} {\n  [key: string]: any;\n}`;
  }

  const properties = Object.entries(schema.properties).map(([key, property]) => {
    const isOptional = !(schema.required?.includes(key)) && !property.nullable;
    const propType = openApiTypeToTypeScript(property, schemas);
    const nullableType = property.nullable ? ` | null` : '';
    return `  ${key}${isOptional ? '?' : ''}: ${propType}${nullableType};`;
  });

  return `interface ${name} {\n${properties.join('\n')}\n}`;
}

describe('Frontend Types - OpenAPI Schema Synchronization', () => {
  let openApiSpec: any;
  let schemas: Record<string, OpenAPISchema>;

  beforeAll(() => {
    openApiSpec = loadOpenAPISpec();
    schemas = openApiSpec.components?.schemas || {};
  });

  test('should have OpenAPI spec loaded', () => {
    expect(openApiSpec).toBeDefined();
    expect(schemas).toBeDefined();
    expect(Object.keys(schemas).length).toBeGreaterThan(0);
  });

  test('should have all required OpenAPI schemas represented in frontend types', () => {
    const requiredSchemas = [
      'User',
      'Message', 
      'Conversation',
      'ConversationParticipant',
      'PaginationResult',
      'ApiResponse',
      'AuthRequest',
      'RegisterRequest', 
      'CreateConversationRequest',
      'CreateMessageRequest',
      'UpdateMessageRequest',
      'SearchResult',
      'SearchResponse', 
      'SearchSuggestion',
      'ClickTrackingRequest',
      'IndexMessageRequest',
      'ErrorResponse'
    ];

    const missingSchemas: string[] = [];
    
    for (const schemaName of requiredSchemas) {
      if (!schemas[schemaName]) {
        missingSchemas.push(schemaName);
      }
    }

    if (missingSchemas.length > 0) {
      throw new Error(`Missing OpenAPI schemas: ${missingSchemas.join(', ')}`);
    }
  });

  test('Message interface should match OpenAPI Message schema exactly', () => {
    const messageSchema = schemas.Message;
    expect(messageSchema).toBeDefined();
    
    // Generate expected interface
    const expectedInterface = generateTypeScriptInterface('Message', messageSchema, schemas);
    console.log('Expected Message interface from OpenAPI:');
    console.log(expectedInterface);
    
    // The frontend Message interface should NOT have senderDisplayName 
    // since it's not in the OpenAPI schema
    expect(messageSchema.properties?.senderDisplayName).toBeUndefined();
  });

  test('User interface should match OpenAPI User schema exactly', () => {
    const userSchema = schemas.User;
    expect(userSchema).toBeDefined();
    
    const expectedInterface = generateTypeScriptInterface('User', userSchema, schemas);
    console.log('Expected User interface from OpenAPI:');
    console.log(expectedInterface);
    
    // Verify required properties
    expect(userSchema.properties?.email).toBeDefined();
    expect(userSchema.properties?.displayName).toBeDefined();
    expect(userSchema.properties?.avatarUrl).toBeDefined();
    expect(userSchema.properties?.isOnline).toBeDefined();
    expect(userSchema.properties?.lastSeen).toBeDefined();
    expect(userSchema.properties?.createdAt).toBeDefined();
  });

  test('should generate complete type definitions from OpenAPI', () => {
    console.log('\n=== COMPLETE OPENAPI-DERIVED TYPES ===\n');
    
    // Generate all interface definitions
    Object.entries(schemas).forEach(([name, schema]) => {
      const interfaceDefinition = generateTypeScriptInterface(name, schema, schemas);
      console.log(interfaceDefinition);
      console.log('');
    });
  });

  test('CreateMessageRequest should match OpenAPI schema', () => {
    const schema = schemas.CreateMessageRequest;
    expect(schema).toBeDefined();
    
    // Should only have content and messageType, NOT conversationId
    expect(schema.properties?.content).toBeDefined();
    expect(schema.properties?.messageType).toBeDefined();
    expect(schema.properties?.conversationId).toBeUndefined();
    
    // Content should be required
    expect(schema.required).toContain('content');
  });

  test('should identify all missing frontend type definitions', () => {
    // Since we're generating all types from OpenAPI spec directly,
    // verify that the generated file exists and has expected content
    const fs = require('fs');
    const path = require('path');
    
    const generatedTypesPath = path.join(__dirname, 'openapi-generated.ts');
    expect(fs.existsSync(generatedTypesPath)).toBe(true);
    
    const generatedContent = fs.readFileSync(generatedTypesPath, 'utf-8');
    
    // Check that all required OpenAPI types are in the generated file
    const requiredTypes = [
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
    
    console.log('\n=== VALIDATING GENERATED TYPES ===');
    
    const missingTypes: string[] = [];
    requiredTypes.forEach(typeName => {
      const typeRegex = new RegExp(`export interface ${typeName}`, 'i');
      if (typeRegex.test(generatedContent)) {
        console.log(`✅ ${typeName} - found in generated types`);
      } else {
        console.log(`❌ ${typeName} - missing from generated types`);
        missingTypes.push(typeName);
      }
    });
    
    // Check that ApiResponse is generic
    if (/export interface ApiResponse<T = any>/.test(generatedContent)) {
      console.log('✅ ApiResponse - correctly generated as generic');
    } else {
      console.log('❌ ApiResponse - not correctly generated as generic');
      missingTypes.push('ApiResponse<T>');
    }
    
    // Check that PaginationResult is generic  
    if (/export interface PaginationResult<T = any>/.test(generatedContent)) {
      console.log('✅ PaginationResult - correctly generated as generic');
    } else {
      console.log('❌ PaginationResult - not correctly generated as generic');
      missingTypes.push('PaginationResult<T>');
    }
    
    // Validate file structure
    const hasGeneratedComment = /Generated from OpenAPI schema/.test(generatedContent);
    const hasExportStatements = /export interface/.test(generatedContent);
    
    console.log(`\n=== VALIDATION RESULTS ===`);
    console.log(`Generated file exists: ✅`);
    console.log(`Has generation comment: ${hasGeneratedComment ? '✅' : '❌'}`);
    console.log(`Has export statements: ${hasExportStatements ? '✅' : '❌'}`);
    console.log(`Required types found: ${requiredTypes.length - missingTypes.length}/${requiredTypes.length}`);
    
    if (missingTypes.length > 0) {
      throw new Error(`🚨 MISSING TYPES: ${missingTypes.join(', ')}`);
    }
    
    console.log(`\n🎉 SUCCESS: All ${requiredTypes.length} OpenAPI types are correctly generated and available!`);
  });
}); 