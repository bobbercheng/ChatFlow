import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Helper function to extract routes from TypeScript files
function extractRoutesFromFile(filePath: string): Array<{ method: string; path: string; file: string }> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: Array<{ method: string; path: string; file: string }> = [];
  
  // Regular expression to match router method calls
  const routeRegex = /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g;
  
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1]?.toUpperCase();
    let routePath = match[2];
    
    if (!method || !routePath) continue;
    
    // Convert Express-style params to OpenAPI style
    routePath = routePath.replace(/:(\w+)/g, '{$1}');
    
    routes.push({
      method,
      path: routePath,
      file: path.basename(filePath)
    });
  }
  
  return routes;
}

// Helper function to extract paths from OpenAPI spec
function extractPathsFromOpenAPI(openApiPath: string): Array<{ method: string; path: string }> {
  const content = fs.readFileSync(openApiPath, 'utf-8');
  const spec = yaml.load(content) as any;
  const paths: Array<{ method: string; path: string }> = [];
  
  if (spec.paths) {
    for (const [path, pathSpec] of Object.entries(spec.paths)) {
      if (typeof pathSpec === 'object' && pathSpec !== null) {
        for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
          if ((pathSpec as any)[method]) {
            paths.push({
              method: method.toUpperCase(),
              path: path
            });
          }
        }
      }
    }
  }
  
  return paths;
}

// Helper function to normalize paths for comparison
function normalizePath(path: string, baseRoute: string = ''): string {
  // Remove /v1 prefix from OpenAPI paths for comparison
  let normalized = path.replace(/^\/v1/, '');
  
  // Add base route prefix if provided
  if (baseRoute) {
    normalized = `/${baseRoute}${normalized}`;
  }
  
  // Remove trailing slashes for consistent comparison
  if (normalized.endsWith('/') && normalized !== '/') {
    normalized = normalized.slice(0, -1);
  }
  
  return normalized;
}

// Helper function to get route files
function getRouteFiles(): string[] {
  const routesDir = path.join(__dirname, 'routes');
  return fs.readdirSync(routesDir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map(file => path.join(routesDir, file));
}

describe('OpenAPI-Routes Consistency', () => {
  const openApiPath = path.join(__dirname, 'openapi.yaml');
  let openApiPaths: Array<{ method: string; path: string }>;
  let allRoutes: Array<{ method: string; path: string; file: string }>;

  beforeAll(() => {
    // Extract paths from OpenAPI spec
    openApiPaths = extractPathsFromOpenAPI(openApiPath);
    
    // Extract routes from all route files
    allRoutes = [];
    const routeFiles = getRouteFiles();
    
    for (const file of routeFiles) {
      const fileName = path.basename(file, '.ts');
      const routes = extractRoutesFromFile(file);
      
             // Add proper base route based on file name
       const processedRoutes = routes.map(route => {
         let fullPath = route.path;
         
         // Add base path based on route file
         switch (fileName) {
           case 'auth':
             fullPath = `/auth${route.path}`;
             break;
           case 'users':
             fullPath = `/users${route.path}`;
             break;
           case 'conversations':
             // Remove leading slash from route.path to avoid double slashes
             const conversationPath = route.path.startsWith('/') ? route.path.substring(1) : route.path;
             fullPath = conversationPath === '' ? '/conversations' : `/conversations/${conversationPath}`;
             break;
           case 'messages':
             // Messages routes are nested under conversations
             if (route.path.startsWith('/{conversationId}/messages')) {
               fullPath = `/conversations${route.path}`;
             }
             break;
           case 'search':
             fullPath = `/search${route.path}`;
             break;
           case 'admin':
             fullPath = `/admin${route.path}`;
             break;
           case 'keys':
             fullPath = `/keys${route.path}`;
             break;
           case 'sponsors':
             fullPath = `/admin/sponsors${route.path}`;
             break;
         }
        
        return {
          ...route,
          path: fullPath
        };
      });
      
      allRoutes.push(...processedRoutes);
    }
  });

  test('should have OpenAPI documentation for all routes', () => {
    const missingFromOpenAPI: Array<{ method: string; path: string; file: string }> = [];
    
    for (const route of allRoutes) {
      const normalizedRoutePath = normalizePath(route.path);
      const found = openApiPaths.some(apiPath => 
        apiPath.method === route.method && 
        normalizePath(apiPath.path) === normalizedRoutePath
      );
      
      if (!found) {
        missingFromOpenAPI.push({
          ...route,
          path: normalizedRoutePath
        });
      }
    }
    
    if (missingFromOpenAPI.length > 0) {
      const details = missingFromOpenAPI.map(route => 
        `  ${route.method} ${route.path} (from ${route.file})`
      ).join('\n');
      
      throw new Error(`Found ${missingFromOpenAPI.length} routes missing from OpenAPI documentation:\n${details}`);
    }
  });

  test('should not have orphaned OpenAPI paths without corresponding routes', () => {
    const orphanedPaths: Array<{ method: string; path: string }> = [];
    
    for (const apiPath of openApiPaths) {
      const normalizedApiPath = normalizePath(apiPath.path);
      const found = allRoutes.some(route => 
        route.method === apiPath.method && 
        normalizePath(route.path) === normalizedApiPath
      );
      
      if (!found) {
        orphanedPaths.push({
          method: apiPath.method,
          path: normalizedApiPath
        });
      }
    }
    
    if (orphanedPaths.length > 0) {
      const details = orphanedPaths.map(path => 
        `  ${path.method} ${path.path}`
      ).join('\n');
      
      throw new Error(`Found ${orphanedPaths.length} OpenAPI paths without corresponding routes:\n${details}`);
    }
  });

  test('should have swagger annotations for all routes', () => {
    const routesWithoutSwagger: Array<{ method: string; path: string; file: string }> = [];
    
    const routeFiles = getRouteFiles();
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const routes = extractRoutesFromFile(file);
      
      for (const route of routes) {
        // Check if there's a swagger comment before this route
        const routePattern = new RegExp(`router\\.${route.method.toLowerCase()}\\(['"\`]${route.path.replace(/[{}]/g, '\\$&')}['"\`]`, 'i');
        const routeMatch = content.search(routePattern);
        
        if (routeMatch !== -1) {
          // Look for @swagger comment in the 2000 characters before the route definition
          const beforeRoute = content.substring(Math.max(0, routeMatch - 2000), routeMatch);
          const hasSwaggerComment = /@swagger/i.test(beforeRoute) || /\*\s*@swagger/i.test(beforeRoute);
          
          if (!hasSwaggerComment) {
            routesWithoutSwagger.push({
              ...route,
              file: path.basename(file)
            });
          }
        }
      }
    }
    
    if (routesWithoutSwagger.length > 0) {
      const details = routesWithoutSwagger.map(route => 
        `  ${route.method} ${route.path} (in ${route.file})`
      ).join('\n');
      
      throw new Error(`Found ${routesWithoutSwagger.length} routes without @swagger annotations:\n${details}`);
    }
  });

  test('should list all discovered routes and OpenAPI paths for verification', () => {
    console.log('\n=== ROUTES DISCOVERED ===');
    allRoutes.forEach(route => {
      console.log(`${route.method.padEnd(6)} ${route.path.padEnd(50)} (${route.file})`);
    });
    
    console.log('\n=== OPENAPI PATHS ===');
    openApiPaths.forEach(path => {
      console.log(`${path.method.padEnd(6)} ${normalizePath(path.path)}`);
    });
    
    console.log(`\nSummary: Found ${allRoutes.length} routes and ${openApiPaths.length} OpenAPI paths`);
  });
}); 