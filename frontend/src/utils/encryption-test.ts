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
    console.log('🧪 [TEST] Starting encryption roundtrip test...');
    
    try {
      if (!encryptionService.isReady()) {
        console.error('🧪 [TEST ERROR] Encryption service not initialized');
        return false;
      }

      console.log('🧪 [TEST] Testing with data:', testData);

      // Step 1: Encrypt
      console.log('🧪 [TEST] Step 1: Encrypting...');
      const encrypted = await encryptionService.encryptMessage(testData);
      
      console.log('🧪 [TEST] Encrypted result:', {
        dataLength: encrypted.data.length,
        keyId: encrypted.encryption.keyId,
        algorithm: encrypted.encryption.algorithm,
        ivLength: encrypted.encryption.iv.length,
        tagLength: encrypted.encryption.tag.length,
        timestamp: encrypted.encryption.timestamp
      });

      // Step 2: Decrypt
      console.log('🧪 [TEST] Step 2: Decrypting...');
      const decrypted = await encryptionService.decryptField(encrypted);
      
      console.log('🧪 [TEST] Decrypted result:', decrypted);

      // Step 3: Verify
      const success = decrypted === testData;
      console.log('🧪 [TEST] Roundtrip test result:', success ? '✅ SUCCESS' : '❌ FAILED');
      
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
    console.log('🧪 [TEST] Testing server message decryption...');
    console.log('🧪 [TEST] Server encrypted field:', encryptedField);
    
    try {
      if (!encryptionService.isReady()) {
        console.error('🧪 [TEST ERROR] Encryption service not initialized');
        return null;
      }

      const decrypted = await encryptionService.decryptField(encryptedField);
      console.log('🧪 [TEST] Successfully decrypted server message:', decrypted);
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
    console.log('🧪 [TEST] Current encryption configuration:');
    
    if (!encryptionService.isReady()) {
      console.log('❌ Encryption service not ready');
      return;
    }

    const keyContext = encryptionService.getKeyContext();
    if (keyContext) {
      console.log('✅ Key Context:', {
        userEmail: keyContext.userEmail,
        keyIds: keyContext.keyIds,
        salt: keyContext.salt
      });
    } else {
      console.log('❌ No key context available');
    }
  }

  /**
   * Manual test for specific user and keyId combination
   */
  static async testKeyDerivation(keyId: string, userEmail: string, testData: string = 'test'): Promise<void> {
    console.log('🧪 [TEST] Manual key derivation test:', { keyId, userEmail, testData });
    
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
      console.log('🧪 [TEST] Manual encryption result:', encrypted);

      const decrypted = await testService.decryptField(encrypted);
      console.log('🧪 [TEST] Manual decryption result:', decrypted);

      const success = decrypted === testData;
      console.log('🧪 [TEST] Manual test result:', success ? '✅ SUCCESS' : '❌ FAILED');

    } catch (error) {
      console.error('🧪 [TEST ERROR] Manual test failed:', error);
    }
  }

  /**
   * Compare frontend encryption with expected backend format
   */
  static async compareWithBackend(testData: string = 'test message'): Promise<void> {
    console.log('🧪 [TEST] Comparing frontend encryption with backend format...');
    
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

      console.log('🧪 [TEST] Expected backend key derivation:');
      console.log(`   keyMaterial = "${keyContext.keyIds.message}:${keyContext.userEmail}"`);
      console.log(`   salt = "${keyContext.salt}"`);
      console.log(`   algorithm = scrypt`);

      console.log('🧪 [TEST] Frontend implementation:');
      console.log(`   keyMaterial = "${keyContext.keyIds.message}:${keyContext.userEmail}"`);
      console.log(`   salt = "${keyContext.salt}"`);
      console.log(`   algorithm = PBKDF2 (approximation)`);

      // Test our encryption
      const encrypted = await encryptionService.encryptMessage(testData);
      
      console.log('🧪 [TEST] Frontend encrypted format:');
      console.log(`   data: ${encrypted.data}`);
      console.log(`   iv: ${encrypted.encryption.iv}`);
      console.log(`   tag: ${encrypted.encryption.tag}`);
      console.log(`   keyId: ${encrypted.encryption.keyId}`);

      // Show what backend expects for tag verification
      const expectedTagData = encrypted.data + encrypted.encryption.keyId;
      console.log('🧪 [TEST] Tag verification data:', expectedTagData.substring(0, 100) + '...');

    } catch (error) {
      console.error('🧪 [TEST ERROR] Comparison failed:', error);
    }
  }

  /**
   * Test the exact message that failed
   */
  static async testFailedMessage(): Promise<void> {
    console.log('🧪 [TEST] Testing the failed message from your example...');
    
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

    console.log('🧪 [TEST] Failed message details:', failedMessage);

    try {
      const result = await this.testServerDecryption(failedMessage);
      if (result) {
        console.log('🧪 [TEST] ✅ Successfully decrypted failed message:', result);
      } else {
        console.log('🧪 [TEST] ❌ Failed to decrypt message');
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
    console.log('🧪 [AUTO-TEST] Running automatic encryption test...');
    EncryptionTestUtil.testEncryptionRoundtrip().then(success => {
      console.log('🧪 [AUTO-TEST] Automatic test result:', success ? '✅ PASS' : '❌ FAIL');
    });
  } else {
    console.log('🧪 [AUTO-TEST] Encryption service not ready, skipping auto-test');
  }
}, 2000);

export default EncryptionTestUtil; 