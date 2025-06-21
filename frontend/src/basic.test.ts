// Basic test to verify Jest setup is working
describe('Frontend Test Setup', () => {
    test('should pass a basic test', () => {
        expect(1 + 1).toBe(2);
    });

    test('should have DOM available', () => {
        const div = document.createElement('div');
        div.textContent = 'test';
        expect(div.textContent).toBe('test');
    });

    test('should clean up DOM between tests', () => {
        document.body.innerHTML = '<div>previous test</div>';
        expect(document.body.innerHTML).toBe('<div>previous test</div>');
        // The beforeEach in test-setup.ts should clean this up for the next test
    });

    test('should have clean DOM from previous test', () => {
        expect(document.body.innerHTML).toBe('');
    });
}); 