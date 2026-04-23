/**
 * firebase-messaging-sw.js
 *
 * Separate service worker file required by Firebase Cloud Messaging
 * for handling background push messages.
 *
 * This file is loaded by Firebase SDK alongside the main sw.js.
 * The actual push handling is done in sw.js via the 'push' event listener.
 */

// Firebase SDK expects this file to exist at the root.
// We intentionally keep it minimal because our main sw.js handles everything.
