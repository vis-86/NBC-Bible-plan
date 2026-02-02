  import crypto from 'crypto';

/**
 * Verifies the authenticity of data received from the Telegram Web App.
 * @param initData The raw initData string from the Telegram Web App.
 * @param botToken The Telegram Bot Token.
 * @returns { valid: boolean, user: any } Result of verification and parsed user data.
 */
export function verifyTelegramInitData(initData: string, botToken: string) {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    // Sort parameters alphabetically
    const params = Array.from(urlParams.entries())
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    // В dev режиме пропускаем проверку хеша для мок данных
    const isDev = process.env.NODE_ENV === 'development';
    
    if (!isDev) {
      // Create the secret key using the bot token
      const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

      // Calculate the hash of the data check string
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(params)
        .digest('hex');

      if (calculatedHash !== hash) {
        return { valid: false, error: 'Hash mismatch' };
      }
    }

    // Optional: Check auth_date to prevent replay attacks (e.g., max 24 hours old)
    const authDate = parseInt(urlParams.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, error: 'Data is too old' };
    }

    const userJson = urlParams.get('user');
    const user = userJson ? JSON.parse(userJson) : null;

    return { valid: true, user };
  } catch (error) {
    console.error('Telegram verification error:', error);
    return { valid: false, error: 'Verification failed' };
  }
}
