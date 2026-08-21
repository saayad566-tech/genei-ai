import { EventEmitter } from "events";

class WebhookEventEmitter extends EventEmitter {}
export const webhookEvents = new WebhookEventEmitter();
