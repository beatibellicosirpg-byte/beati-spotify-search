// Cache del token a nivel de módulo: se reutiliza entre invocaciones
// "calientes" de la función serverless, así no pedimos un token nuevo
// en cada búsqueda (eso es lo que probablemente disparaba el límite
// de peticiones de Spotify y causaba resultados vacíos silenciosos).
let cachedToken = null;
let tokenExpiresAt = 0; // timestamp en ms

async function getAccessToken(clientId, clientSecret) {
  const now = Date.now();

  // Si tenemos un token todavía válido (con 60s de margen), lo reusamos
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.access_token) {
    // Error real al pedir el token (credenciales, rate limit, etc.)
    throw new Error('No se pudo obtener token de Spotify: ' + JSON.stringify(tokenData));
  }

  cachedToken = tokenData.access_token;
  // expires_in viene en segundos (normalmente 3600 = 1 hora)
  tokenExpiresAt = now + (tokenData.expires_in * 1000);

  return cachedToken;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);

    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=50`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      // Error real de la búsqueda (token inválido, rate limit, etc.)
      // Si el token cacheado quedó mal, lo invalidamos para forzar uno nuevo la próxima vez.
      if (searchResponse.status === 401) {
        cachedToken = null;
      }
      return res.status(searchResponse.status).json({
        error: 'Error al buscar en Spotify',
        detalle: searchData
      });
    }

    const resultados = (searchData.tracks?.items || []).map(track => ({
      id: track.id,
      nombre: track.name,
      artista: track.artists.map(a => a.name).join(', '),
      imagen: track.album.images[2]?.url || track.album.images[0]?.url,
      tipo: 'track'
    }));

    res.status(200).json({ resultados });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar en Spotify', detalle: String(error) });
  }
}
