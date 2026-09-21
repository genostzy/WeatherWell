/**
 * Generate VAPID keys for Web Push.
 *
 * Usage: npx tsx scripts/generate-vapid-keys.ts
 *
 * Outputs the keys to stdout. Store them as environment variables:
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY (for the client)
 * - VAPID_PRIVATE_KEY (for the server)
 */
import webPush from "web-push";

const vapidKeys = webPush.generateVAPIDKeys();

console.log("VAPID_PUBLIC_KEY=" + vapidKeys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + vapidKeys.privateKey);
console.log("");
console.log("Add these to your .env.local:");
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY="' + vapidKeys.publicKey + '"');
console.log('VAPID_PRIVATE_KEY="' + vapidKeys.privateKey + '"');
console.log('VAPID_SUBJECT="mailto:admin@weatherwell.app"');
