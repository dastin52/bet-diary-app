// functions/api/tasks/run-update.ts
import { Env } from '../../telegram/types';
import { runUpdateTask } from '../../tasks/update-predictions';

// This defines the environment variables and bindings expected by this function
interface EventContext<E> {
    request: Request;
    env: E;
    waitUntil: (promise: Promise<any>) => void;
}

type PagesFunction<E = unknown> = (
    context: EventContext<E>
) => Response | Promise<Response>;

/**
 * This is the API endpoint that gets triggered manually from the admin panel
 * to force a refresh of the prediction data.
 */
export const onRequestPost: PagesFunction<Env> = async ({ env, waitUntil }) => {
    // Run the update in the background without waiting for it to finish
    // This provides an immediate response to the client.
    waitUntil(runUpdateTask(env));
    
    // Immediately respond to the client with a 202 Accepted status
    return new Response(JSON.stringify({ message: 'Prediction update process has been started in the background.' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
    });
};