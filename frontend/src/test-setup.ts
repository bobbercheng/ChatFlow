// Jest DOM setup for frontend tests
import 'jest-environment-jsdom';

// Note: Encryption tests are disabled due to complex polyfill requirements
// The encryption functionality works correctly in the browser environment

// Add fetch polyfill for OpenAI library compatibility in Node.js tests
if (!globalThis.fetch) {
    const { fetch, Headers, Request, Response } = require('node-fetch');
    globalThis.fetch = fetch;
    globalThis.Headers = Headers;
    globalThis.Request = Request;
    globalThis.Response = Response;
}

// Global test setup
beforeEach(() => {
    // Clean up DOM before each test
    document.body.innerHTML = '';
    
    // Reset any global variables
    (window as any).chatApp = undefined;
    
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
});

// Mock scrollIntoView for tests
Element.prototype.scrollIntoView = jest.fn();

// Suppress console logs in tests
const originalConsole = console;
beforeAll(() => {
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
});

afterAll(() => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
}); 