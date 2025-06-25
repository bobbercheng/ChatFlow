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

// Mock build-time version variable
(global as any).__FRONTEND_VERSION__ = 'test-version';

// Setup localStorage mock
const localStorageMock = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn()
};

const sessionStorageMock = {
    getItem: jest.fn(() => null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn()
};

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
});

Object.defineProperty(window, 'sessionStorage', {
    value: sessionStorageMock,
    writable: true
});

// Global test setup
beforeEach(() => {
    // Clean up DOM before each test
    document.body.innerHTML = '';
    
    // Reset any global variables
    (window as any).chatApp = undefined;
    
    // Reset localStorage and sessionStorage mocks
    jest.clearAllMocks();
    localStorageMock.clear.mockClear();
    localStorageMock.getItem.mockReturnValue(null);
    sessionStorageMock.clear.mockClear();
    sessionStorageMock.getItem.mockReturnValue(null);
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