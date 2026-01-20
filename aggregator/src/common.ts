/**
 * Retries an async operation with exponential backoff.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (retries === 0) throw error;
        console.warn(`   ⚠️ API Call Failed. Retrying in ${delay}ms... (Attempts left: ${retries}). Error: ${error.message}`);
        await new Promise(r => setTimeout(r, delay));
        return retryWithBackoff(fn, retries - 1, delay * 2);
    }
}

/**
 * Sanitizes strings for safe filename usage.
 */
export function sanitize(str: string): string {
    if (!str) return "Unknown";
    // Keep only alphanumeric, spaces, hyphens, and underscores
    return str.replace(/[^a-zA-Z0-9 \-_]/g, '').trim().substring(0, 50);
}