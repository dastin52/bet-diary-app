// functions/api/telegram/generate-code.ts

interface CodeGenerationRequest {
    email: string;
}

// NOTE: This is a placeholder implementation.
// Cloudflare Functions are stateless. Storing codes in memory or files won't work reliably across requests.
// For a production environment, you MUST replace this with a persistent storage solution like Cloudflare KV (Key-Value store) or a database.

// FIX: Replaced 'PagesFunction' with an explicit type for the context object, as the 'PagesFunction' type was not found.
export const onRequestPost = async ({ request }: { request: Request }) => {
    try {
        // FIX: The default Request.json() method is not generic. Cast the result to the expected type.
        const body = await request.json() as CodeGenerationRequest;
        const { email } = body;

        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        // In a real application, you would generate a random code,
        // store it in Cloudflare KV with the user's email and an expiration time.
        // e.g., await env.YOUR_KV_NAMESPACE.put(code, JSON.stringify({ email }), { expirationTtl: 300 });

        const mockCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        console.log(`Generated mock code ${mockCode} for user ${email}. This is not stored persistently.`);

        return new Response(JSON.stringify({ code: mockCode }), {
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