import type { Express } from "express";
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { storage } from "./storage";
import { hotmartWebhookHandler } from "./hotmart-webhook";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Webhook Hotmart ──────────────────────────────────────────────────────────
  // URL a configurar na Hotmart: https://SEU_DOMINIO/api/webhook/hotmart
  app.post('/api/webhook/hotmart', hotmartWebhookHandler)

  return httpServer;
}
