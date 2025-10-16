// functions/api/telegram/webhook.ts
import { handleRequest } from '../../src/telegram/handler';
import { Env, TelegramUpdate } from '../../src/telegram/types';

interface EventContext {
    request: Request;
    env: Env;
    waitUntil: (promise: Promise<any>) => void;
}

// This is the entry point for the Cloudflare Function.
// It's kept minimal to delegate all logic to the main handler.
export const onRequestPost = async (context: EventContext): Promise<Response> => {
    return handleRequest(context.request, context.env);
};
