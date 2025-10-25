// functions/_middleware.ts

/**
 * This middleware function is a pass-through. It simply calls the next function
 * in the chain. Its presence ensures that the Cloudflare build system correctly
 * identifies the /functions directory as containing server-side logic.
 * The actual type for the context is globally available in the Cloudflare environment.
 */
export const onRequest = async (context: any) => {
  // The 'next' function is on the context object and passes the request
  // to the next function in the chain or to the static asset.
  return await context.next();
};
