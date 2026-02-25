module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  // Handle case where body isn't parsed
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: { message: 'Invalid JSON body' } });
    }
  }

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: { message: 'Missing request body' } });
  }

  const { apiKey, ...completionBody } = body;

  if (!apiKey) {
    return res.status(400).json({ error: { message: 'API key is required' } });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(completionBody),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
