/**
 * Vercel serverless entry (see vercel.json).
 * The Express app from app.js is exported as the handler; the database is
 * initialized once per cold start (cached by the platform afterwards).
 */
import app, { ready } from "./app.js";

let initialized = false;

export default async function handler(req, res) {
  if (!initialized) {
    await ready;
    initialized = true;
  }
  return app(req, res);
}
