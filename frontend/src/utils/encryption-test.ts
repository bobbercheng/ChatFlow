/**
 * Encryption Test Utility for ChatFlow Frontend
 * Use this to test and debug encryption compatibility with backend
 */

import { encryptionService, EncryptedField, KeyContext } from './encryption.js';

export class EncryptionTestUtil {
  
  /**
   * Test encryption roundtrip with detailed logging
   */
  static async testEncryptionRoundtrip(testData: string = 'Hello, ChatFlow!'): Promise<boolean> {
    console.info('🧪 [TEST] Starting encryption roundtrip test...');
    
    try {
      if (!encryptionService.isReady()) {
        console.error('🧪 [TEST ERROR] Encryption service not initialized');
        return false;
      }

      console.info('🧪 [TEST] Testing with data:', testData);

      // Step 1: Encrypt
      console.info('🧪 [TEST] Step 1: Encrypting...');
      const encrypted = await encryptionService.encryptMessage(testData);
      
      console.info('🧪 [TEST] Encrypted result:', {
        dataLength: encrypted.data.length,
        keyId: encrypted.encryption.keyId,
        algorithm: encrypted.encryption.algorithm,
        ivLength: encrypted.encryption.iv.length,
        tagLength: encrypted.encryption.tag.length,
        timestamp: encrypted.encryption.timestamp
      });

      // Step 2: Decrypt
      console.info('🧪 [TEST] Step 2: Decrypting...');
      const decrypted = await encryptionService.decryptField(encrypted);
      
      console.info('🧪 [TEST] Decrypted result:', decrypted);

      // Step 3: Verify
      const success = decrypted === testData;
      console.info('🧪 [TEST] Roundtrip test result:', success ? '✅ SUCCESS' : '❌ FAILED');
      
      if (!success) {
        console.error('🧪 [TEST ERROR] Data mismatch:', {
          original: testData,
          decrypted: decrypted
        });
      }

      return success;

    } catch (error) {
      console.error('🧪 [TEST ERROR] Roundtrip test failed:', error);
      return false;
    }
  }

  /**
   * Test decryption of a message from the server
   */
  static async testServerDecryption(encryptedField: EncryptedField): Promise<string | null> {
    console.info('🧪 [TEST] Testing server message decryption...');
    console.info('🧪 [TEST] Server encrypted field:', encryptedField);
    
    try {
      if (!encryptionService.isReady()) {
        console.error('🧪 [TEST ERROR] Encryption service not initialized');
        return null;
      }

      const decrypted = await encryptionService.decryptField(encryptedField);
      console.info('🧪 [TEST] Successfully decrypted server message:', decrypted);
      return decrypted;

    } catch (error) {
      console.error('🧪 [TEST ERROR] Failed to decrypt server message:', error);
      return null;
    }
  }

  /**
   * Show current encryption configuration
   */
  static showConfig(): void {
    console.info('🧪 [TEST] Current encryption configuration:');
    
    if (!encryptionService.isReady()) {
      console.info('❌ Encryption service not ready');
      return;
    }

    const keyContext = encryptionService.getKeyContext();
    if (keyContext) {
      console.info('✅ Key Context:', {
        userEmail: keyContext.userEmail,
        keyIds: keyContext.keyIds,
        salt: keyContext.salt
      });
    } else {
      console.info('❌ No key context available');
    }
  }

  /**
   * Manual test for specific user and keyId combination
   */
  static async testKeyDerivation(keyId: string, userEmail: string, testData: string = 'test'): Promise<void> {
    console.info('🧪 [TEST] Manual key derivation test:', { keyId, userEmail, testData });
    
    try {
      // Create a test key context
      const testKeyContext: KeyContext = {
        keyIds: {
          message: keyId,
          search: keyId,
          suggestion: keyId
        },
        userEmail,
        salt: 'salt'
      };

      // Initialize with test context
      const testService = new (await import('./encryption.js')).EncryptionService();
      await testService.initialize(testKeyContext);

      // Test encryption/decryption
      const encrypted = await testService.encryptMessage(testData);
      console.info('🧪 [TEST] Manual encryption result:', encrypted);

      const decrypted = await testService.decryptField(encrypted);
      console.info('🧪 [TEST] Manual decryption result:', decrypted);

      const success = decrypted === testData;
      console.info('🧪 [TEST] Manual test result:', success ? '✅ SUCCESS' : '❌ FAILED');

    } catch (error) {
      console.error('🧪 [TEST ERROR] Manual test failed:', error);
    }
  }

  /**
   * Compare frontend encryption with expected backend format
   */
  static async compareWithBackend(testData: string = 'test message'): Promise<void> {
    console.info('🧪 [TEST] Comparing frontend encryption with backend format...');
    
    try {
      if (!encryptionService.isReady()) {
        console.error('🧪 [TEST ERROR] Encryption service not initialized');
        return;
      }

      const keyContext = encryptionService.getKeyContext();
      if (!keyContext) {
        console.error('🧪 [TEST ERROR] No key context');
        return;
      }

      console.info('🧪 [TEST] Expected backend key derivation:');
      console.info(`   keyMaterial = "${keyContext.keyIds.message}:${keyContext.userEmail}"`);
      console.info(`   salt = "${keyContext.salt}"`);
      console.info(`   algorithm = scrypt`);

      console.info('🧪 [TEST] Frontend implementation:');
      console.info(`   keyMaterial = "${keyContext.keyIds.message}:${keyContext.userEmail}"`);
      console.info(`   salt = "${keyContext.salt}"`);
      console.info(`   algorithm = PBKDF2 (approximation)`);

      // Test our encryption
      const encrypted = await encryptionService.encryptMessage(testData);
      
      console.info('🧪 [TEST] Frontend encrypted format:');
      console.info(`   data: ${encrypted.data}`);
      console.info(`   iv: ${encrypted.encryption.iv}`);
      console.info(`   tag: ${encrypted.encryption.tag}`);
      console.info(`   keyId: ${encrypted.encryption.keyId}`);

      // Show what backend expects for tag verification
      const expectedTagData = encrypted.data + encrypted.encryption.keyId;
      console.info('🧪 [TEST] Tag verification data:', expectedTagData.substring(0, 100) + '...');

    } catch (error) {
      console.error('🧪 [TEST ERROR] Comparison failed:', error);
    }
  }

  /**
   * Test the exact message that failed
   */
  static async testFailedMessage(): Promise<void> {
    console.info('🧪 [TEST] Testing the failed message from your example...');
    
    const failedMessage: EncryptedField = {
      data: "o4D47GdlP2njJQ==",
      encryption: {
        algorithm: "AES-256-GCM",
        keyId: "message_key", 
        iv: "tUj5v654yr58CuAy",
        tag: "rkESBhTYSkuLSvIZ7I6yMg==",
        timestamp: 1750620597819,
        nonce: "902caf5f81d1f4d6fd4d8f381918c6f0"
      }
    };

    console.info('🧪 [TEST] Failed message details:', failedMessage);

    try {
      const result = await this.testServerDecryption(failedMessage);
      if (result) {
        console.info('🧪 [TEST] ✅ Successfully decrypted failed message:', result);
      } else {
        console.info('🧪 [TEST] ❌ Failed to decrypt message');
      }
    } catch (error) {
      console.error('🧪 [TEST ERROR] Exception during failed message test:', error);
    }
  }
}

// Export for global access in browser console
(window as any).EncryptionTestUtil = EncryptionTestUtil;

// Auto-run basic test when loaded
setTimeout(() => {
  if (encryptionService.isReady()) {
    console.info('🧪 [AUTO-TEST] Running automatic encryption test...');
    EncryptionTestUtil.testEncryptionRoundtrip().then(success => {
      console.info('🧪 [AUTO-TEST] Automatic test result:', success ? '✅ PASS' : '❌ FAIL');
    });
  } else {
    console.info('🧪 [AUTO-TEST] Encryption service not ready, skipping auto-test');
  }
}, 2000);

export default EncryptionTestUtil; 