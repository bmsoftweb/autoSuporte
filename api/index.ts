import { createApp } from '../server/app.js';

// A Vercel aceita um app Express como handler. O vercel.json roteia todo /api/* para cá.
export default createApp();
