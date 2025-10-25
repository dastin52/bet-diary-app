// functions/_middleware.ts

// This file acts as a universal entry point for all functions.
// Its presence is a strong signal to Cloudflare Pages that this is a full-stack application,
// which should force the "Functions" tab to appear in the project settings.

interface EventContext {
    request: Request;
    next: (request?: Request) => Promise<Response>;
}

export const onRequest: (context: EventContext) => Promise<Response> = async ({ next }) => {
    // This middleware doesn't need to do anything, just pass the request along.
    // Its existence is what matters.
    try {
        return await next();
    } catch (error) {
        console.error("Middleware error:", error);
        return new Response("An error occurred in the middleware.", { status: 500 });
    }
};
