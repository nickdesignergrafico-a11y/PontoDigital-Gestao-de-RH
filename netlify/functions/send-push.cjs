// Netlify Serverless Function: Disparo de Notificações Push via OneSignal
// Requer variável de ambiente na Netlify: ONESIGNAL_REST_API_KEY
// e VITE_ONESIGNAL_APP_ID (ou ONESIGNAL_APP_ID)

export const handler = async function (event) {
  // Configuração CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido. Use POST.' }),
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const { targetUserIds, segment, title, message, url, data } = payload;

    const appId = process.env.ONESIGNAL_APP_ID || process.env.VITE_ONESIGNAL_APP_ID || '990f8354-847b-48fd-9edf-90767bc70ec5';
    const restApiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!restApiKey) {
      console.warn('ONESIGNAL_REST_API_KEY não configurada na Netlify.');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'ONESIGNAL_REST_API_KEY não configurada nas variáveis de ambiente da Netlify.',
        }),
      };
    }

    if (!title || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Campos "title" e "message" são obrigatórios.' }),
      };
    }

    const oneSignalBody = {
      app_id: appId,
      headings: { pt: title, en: title },
      contents: { pt: message, en: message },
      url: url || 'https://pontodigital.netlify.app',
      data: data || {},
      target_channel: 'push',
    };

    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      // Envia para UIDs específicos registrados via OneSignal.login(uid)
      oneSignalBody.include_aliases = {
        external_id: targetUserIds,
      };
    } else if (segment) {
      // Envia para um segmento (ex: "Subscribed Users" ou "Total Subscriptions")
      oneSignalBody.included_segments = [segment];
    } else {
      // Padrão: todos os usuários inscritos
      oneSignalBody.included_segments = ['Subscribed Users'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify(oneSignalBody),
    });

    const result = await response.json();

    return {
      statusCode: response.ok ? 200 : 400,
      headers,
      body: JSON.stringify({ success: response.ok, result }),
    };
  } catch (err) {
    console.error('Erro na função send-push:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
