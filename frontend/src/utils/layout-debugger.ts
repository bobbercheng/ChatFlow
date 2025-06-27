/**
 * Layout Debugging Utility
 * 
 * This utility helps developers identify and prevent layout issues
 * similar to the chat container narrowing problem we encountered.
 * 
 * Usage:
 * - In development: LayoutDebugger.init()
 * - Monitor specific elements: LayoutDebugger.monitor('.chat-container')
 * - Check CSS conflicts: LayoutDebugger.analyzeSpecificity('.chat-container')
 */

interface LayoutChangeEvent {
  element: Element;
  property: string;
  oldValue: string;
  newValue: string;
  timestamp: number;
  stackTrace?: string;
}

interface CSSRule {
  selector: string;
  specificity: number;
  properties: Record<string, string>;
  source: string;
}

class LayoutDebugger {
  private static instance: LayoutDebugger;
  private observers: MutationObserver[] = [];
  private monitoredElements: Set<Element> = new Set();
  private changeHistory: LayoutChangeEvent[] = [];
  private isEnabled: boolean = false;

  private constructor() {}

  static getInstance(): LayoutDebugger {
    if (!LayoutDebugger.instance) {
      LayoutDebugger.instance = new LayoutDebugger();
    }
    return LayoutDebugger.instance;
  }

  /**
   * Initialize the layout debugger (development only)
   */
  static init(): void {
    if (process.env.NODE_ENV !== 'development') {
      console.warn('LayoutDebugger is only available in development mode');
      return;
    }

    const instance = LayoutDebugger.getInstance();
    instance.enable();
    instance.addGlobalStyles();
    instance.setupKeyboardShortcuts();
    
    console.log('🔍 Layout Debugger initialized. Press Ctrl+Shift+L to toggle layout outlines');
  }

  /**
   * Monitor a specific element for layout changes
   */
  static monitor(selector: string): void {
    const instance = LayoutDebugger.getInstance();
    const elements = document.querySelectorAll(selector);
    
    elements.forEach(element => {
      instance.monitorElement(element);
    });
    
    console.log(`🔍 Monitoring ${elements.length} elements matching "${selector}"`);
  }

  /**
   * Analyze CSS specificity conflicts for a selector
   */
  static analyzeSpecificity(selector: string): void {
    const instance = LayoutDebugger.getInstance();
    const analysis = instance.getCSSRulesForSelector(selector);
    
    console.group(`🎯 CSS Specificity Analysis for "${selector}"`);
    analysis.forEach(rule => {
      console.log(`Specificity: ${rule.specificity} | ${rule.selector}`, rule.properties);
    });
    console.groupEnd();

    // Check for potential conflicts
    const conflicts = instance.detectSpecificityConflicts(analysis);
    if (conflicts.length > 0) {
      console.warn('⚠️ Potential specificity conflicts detected:', conflicts);
    }
  }

  /**
   * Get layout change history
   */
  static getChangeHistory(): LayoutChangeEvent[] {
    return LayoutDebugger.getInstance().changeHistory;
  }

  /**
   * Clear monitoring and history
   */
  static cleanup(): void {
    const instance = LayoutDebugger.getInstance();
    instance.disable();
    instance.changeHistory = [];
    instance.monitoredElements.clear();
  }

  private enable(): void {
    this.isEnabled = true;
  }

  private disable(): void {
    this.isEnabled = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  private monitorElement(element: Element): void {
    if (this.monitoredElements.has(element)) return;
    
    this.monitoredElements.add(element);
    
    // Store initial styles
    const initialStyles = this.getLayoutStyles(element);
    
    // Create mutation observer
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
          
          const currentStyles = this.getLayoutStyles(element);
          this.detectStyleChanges(element, initialStyles, currentStyles);
        }
      });
    });
    
    observer.observe(element, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style']
    });
    
    this.observers.push(observer);
  }

  private getLayoutStyles(element: Element): Record<string, string> {
    const styles = window.getComputedStyle(element);
    return {
      width: styles.width,
      height: styles.height,
      padding: styles.padding,
      margin: styles.margin,
      position: styles.position,
      display: styles.display,
      boxSizing: styles.boxSizing,
      top: styles.top,
      left: styles.left,
      right: styles.right,
      bottom: styles.bottom
    };
  }

  private detectStyleChanges(
    element: Element, 
    oldStyles: Record<string, string>, 
    newStyles: Record<string, string>
  ): void {
    Object.keys(newStyles).forEach(property => {
      if (oldStyles[property] !== newStyles[property]) {
        const changeEvent: LayoutChangeEvent = {
          element,
          property,
          oldValue: oldStyles[property],
          newValue: newStyles[property],
          timestamp: Date.now(),
          stackTrace: new Error().stack
        };
        
        this.changeHistory.push(changeEvent);
        
        // Log significant layout changes
        if (this.isSignificantChange(property, oldStyles[property], newStyles[property])) {
          console.warn('📐 Significant layout change detected:', {
            element: element.className || element.tagName,
            property,
            oldValue: oldStyles[property],
            newValue: newStyles[property]
          });
        }
      }
    });
  }

  private isSignificantChange(property: string, oldValue: string, newValue: string): boolean {
    // Define what constitutes a significant change
    const significantProperties = ['width', 'height', 'padding', 'margin'];
    if (!significantProperties.includes(property)) return false;
    
    // Parse pixel values and check for significant differences
    const oldPx = parseFloat(oldValue);
    const newPx = parseFloat(newValue);
    
    if (isNaN(oldPx) || isNaN(newPx)) return true; // Non-numeric changes are significant
    
    return Math.abs(oldPx - newPx) > 5; // More than 5px difference
  }

  private getCSSRulesForSelector(selector: string): CSSRule[] {
    const rules: CSSRule[] = [];
    
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSStyleRule && 
                rule.selectorText && 
                rule.selectorText.includes(selector.replace('.', ''))) {
              
              const properties: Record<string, string> = {};
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                properties[prop] = rule.style.getPropertyValue(prop);
              }
              
              rules.push({
                selector: rule.selectorText,
                specificity: this.calculateSpecificity(rule.selectorText),
                properties,
                source: sheet.href || 'inline'
              });
            }
          }
        } catch (e) {
          // Skip external stylesheets we can't access
        }
      }
    } catch (e) {
      console.warn('Could not analyze stylesheets:', e);
    }
    
    return rules.sort((a, b) => b.specificity - a.specificity);
  }

  private calculateSpecificity(selector: string): number {
    // Simplified specificity calculation
    const ids = (selector.match(/#/g) || []).length * 100;
    const classes = (selector.match(/\./g) || []).length * 10;
    const elements = (selector.match(/[a-zA-Z]/g) || []).length;
    
    return ids + classes + elements;
  }

  private detectSpecificityConflicts(rules: CSSRule[]): string[] {
    const conflicts: string[] = [];
    const groupedByProperty: Record<string, CSSRule[]> = {};
    
    // Group rules by property
    rules.forEach(rule => {
      Object.keys(rule.properties).forEach(prop => {
        if (!groupedByProperty[prop]) {
          groupedByProperty[prop] = [];
        }
        groupedByProperty[prop].push(rule);
      });
    });
    
    // Check for conflicts
    Object.entries(groupedByProperty).forEach(([property, rulesForProp]) => {
      if (rulesForProp.length > 1) {
        const values = new Set(rulesForProp.map(r => r.properties[property]));
        if (values.size > 1) {
          conflicts.push(`${property}: ${Array.from(values).join(' vs ')}`);
        }
      }
    });
    
    return conflicts;
  }

  private addGlobalStyles(): void {
    const style = document.createElement('style');
    style.id = 'layout-debugger-styles';
    style.textContent = `
      .layout-debug-outline * {
        outline: 1px solid rgba(255, 0, 0, 0.3) !important;
      }
      
      .layout-debug-outline .chat-container {
        outline: 2px solid rgba(0, 255, 0, 0.8) !important;
      }
      
      .layout-debug-outline .main-content {
        outline: 2px solid rgba(0, 0, 255, 0.8) !important;
      }
      
      .layout-debug-info {
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
        z-index: 10000;
        max-width: 300px;
      }
    `;
    document.head.appendChild(style);
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        this.toggleLayoutOutlines();
        e.preventDefault();
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        LayoutDebugger.analyzeSpecificity('.chat-container');
        e.preventDefault();
      }
    });
  }

  private toggleLayoutOutlines(): void {
    document.body.classList.toggle('layout-debug-outline');
    
    if (document.body.classList.contains('layout-debug-outline')) {
      this.showLayoutInfo();
    } else {
      this.hideLayoutInfo();
    }
  }

  private showLayoutInfo(): void {
    const existingInfo = document.getElementById('layout-debug-info');
    if (existingInfo) existingInfo.remove();
    
    const info = document.createElement('div');
    info.id = 'layout-debug-info';
    info.className = 'layout-debug-info';
    info.innerHTML = `
      <div><strong>Layout Debugger Active</strong></div>
      <div>Ctrl+Shift+L: Toggle outlines</div>
      <div>Ctrl+Shift+S: Analyze CSS</div>
      <div>Monitored elements: ${this.monitoredElements.size}</div>
      <div>Change events: ${this.changeHistory.length}</div>
    `;
    
    document.body.appendChild(info);
  }

  private hideLayoutInfo(): void {
    const info = document.getElementById('layout-debug-info');
    if (info) info.remove();
  }
}

// Auto-initialize in development
if (process.env.NODE_ENV === 'development') {
  document.addEventListener('DOMContentLoaded', () => {
    LayoutDebugger.init();
    LayoutDebugger.monitor('.chat-container');
    LayoutDebugger.monitor('.main-content');
  });
}

export { LayoutDebugger }; 