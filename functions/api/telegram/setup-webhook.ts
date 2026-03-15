import { Env } from '../../telegram/types';

export const onRequestGet = async ({ env }: { env: Env }) => {
    if (!env.TELEGRAM_BOT_TOKEN) {
        return new Response(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not set' }), { status: 400 });
    }

    const webappUrl = env.WEBAPP_URL || 'https://bet-diary-app.pages.dev';
    const webhookUrl = `${webappUrl}/api/telegram/webhook`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webhookUrl}`);
        const result = await response.json();

        return new Response(JSON.stringify({
            message: 'Webhook setup attempt finished',
            webhookUrl,
            telegramResponse: result
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
};
