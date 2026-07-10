export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Falta el parámetro de búsqueda' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=8`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    const searchData = await searchResponse.json();

    const resultados = (searchData.tracks?.items || []).map(track => ({
      id: track.id,
      nombre: track.name,
      artista: track.artists.map(a => a.name).join(', '),
      imagen: track.album.images[2]?.url || track.album.images[0]?.url,
      tipo: 'track'
    }));

    res.status(200).json({ resultados });
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar en Spotify' });
  }
}
