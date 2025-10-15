
// functions/api/telegram/generate-code.ts

interface CodeGenerationRequest {
    email: string;
}

interface KVNamespace {
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface Env {
    BOT_STATE: KVNamespace;
}

interface EventContext<E> {
    request: Request;
    env: E;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;


export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    // Critical check for KV binding
    if (!env.BOT_STATE) {
        console.error("FATAL: BOT_STATE KV Namespace is not bound in Cloudflare. Cannot generate auth codes.");
        return new Response(JSON.stringify({ error: 'Server configuration error: Storage service is not available.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = (await request.json()) as CodeGenerationRequest;
        const { email } = body;

        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required.' }), {
                status: 400, headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store the code in KV with a 5-minute TTL. Key: `authcode:<code>`, Value: `email`
        await env.BOT_STATE.put(`authcode:${code}`, email, { expirationTtl: 300 });

        console.log(`Generated Telegram auth code ${code} for user ${email}`);

        return new Response(JSON.stringify({ code }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Code generation function error:', error);
        return new Response(JSON.stringify({ error: 'An error occurred while generating the code.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};
