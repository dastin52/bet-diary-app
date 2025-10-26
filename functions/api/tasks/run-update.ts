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
    try {
        // We still use waitUntil to allow the task to complete even if the client disconnects,
        // but we await the task to provide synchronous feedback to the admin.
        const updatePromise = runUpdateTask(env);
        waitUntil(updatePromise);
        await updatePromise;
        
        // Respond with success after the task has completed
        return new Response(JSON.stringify({ message: 'Обновление прогнозов успешно завершено.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        console.error('Manual update run failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка на сервере.';
        return new Response(JSON.stringify({ error: `Не удалось завершить обновление. ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};