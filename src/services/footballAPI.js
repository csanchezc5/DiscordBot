const axios = require('axios');

// Configuración de reintentos
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 segundos

// Función para esperar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Función para reintentar operaciones
const retryOperation = async (operation, retries = MAX_RETRIES, delay = RETRY_DELAY) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            console.log(`🔄 Retry ${i + 1}/${retries} - ${error.message}`);
            
            if (i === retries - 1) {
                throw error; // Último intento fallido
            }
            
            // Esperar antes del siguiente intento, incrementando el delay
            await sleep(delay * (i + 1));
        }
    }
};

// Función para validar configuración
const validateConfig = () => {
    const requiredVars = ['FOOTBALL_API_URL', 'FOOTBALL_API_KEY', 'FOOTBALL_API_HOST'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
    
    // Validar formato de URL
    try {
        new URL(process.env.FOOTBALL_API_URL);
    } catch {
        throw new Error('Invalid FOOTBALL_API_URL format');
    }
    
    console.log('✅ API configuration validated');
};

// Función para hacer request seguro a la API
const makeAPIRequest = async (endpoint, params = {}) => {
    validateConfig();
    
    const operation = async () => {
        console.log(`🌐 Making API request to: ${endpoint}`);
        
        const response = await axios({
            method: 'GET',
            url: `${process.env.FOOTBALL_API_URL}${endpoint}`,
            headers: {
                'X-RapidAPI-Key': process.env.FOOTBALL_API_KEY,
                'X-RapidAPI-Host': process.env.FOOTBALL_API_HOST,
                'Accept': 'application/json',
                'User-Agent': 'DiscordBot/1.0'
            },
            params: {
                ...params
            },
            timeout: 15000, // 15 segundos timeout
            validateStatus: (status) => status < 500 // Solo reintentar en errores de servidor
        });

        // Validar respuesta
        if (response.status === 429) {
            throw new Error('Rate limit exceeded - wait before next request');
        }
        
        if (response.status >= 400) {
            throw new Error(`API returned status ${response.status}: ${response.statusText}`);
        }

        if (!response.data || !response.data.response) {
            throw new Error('Invalid API response structure');
        }

        return response.data;
    };

    return await retryOperation(operation);
};

// Función principal para obtener jugadores
const getAllPopularPlayers = async () => {
    try {
        console.log('🚀 Starting API-Sports data fetch...');
        
        // Configurar ligas principales
        const leagues = [
            { id: 39, name: 'Premier League', season: 2023 },
            { id: 140, name: 'La Liga', season: 2023 },
            { id: 78, name: 'Bundesliga', season: 2023 },
            { id: 61, name: 'Ligue 1', season: 2023 },
            { id: 135, name: 'Serie A', season: 2023 }
        ];

        const allPlayers = [];
        let successfulRequests = 0;
        let failedRequests = 0;

        // Procesar cada liga secuencialmente para evitar rate limits
        for (const league of leagues) {
            try {
                console.log(`📊 Fetching top scorers from ${league.name}...`);
                
                const data = await makeAPIRequest('/players/topscorers', {
                    league: league.id,
                    season: league.season
                });

                if (data.response && Array.isArray(data.response)) {
                    const leaguePlayers = data.response
                        .slice(0, 15) // Top 15 por liga para tener buena variedad
                        .map(playerData => {
                            const player = playerData.player;
                            const stats = playerData.statistics?.[0];
                            
                            if (!player || !stats) {
                                throw new Error('Invalid player data structure');
                            }

                            return {
                                name: player.name || 'Unknown Player',
                                team: stats.team?.name || 'Unknown Team',
                                position: normalizePosition(stats.games?.position),
                                nationality: player.nationality || 'Unknown',
                                age: player.age || 25,
                                photo: player.photo || null,
                                goals: stats.goals?.total || 0,
                                assists: stats.goals?.assists || 0,
                                appearances: stats.games?.appearences || 0,
                                league: league.name,
                                rarity: calculateRarity(stats)
                            };
                        })
                        .filter(player => player.name !== 'Unknown Player'); // Filtrar datos inválidos

                    allPlayers.push(...leaguePlayers);
                    successfulRequests++;
                    
                    console.log(`✅ ${league.name}: ${leaguePlayers.length} players added`);
                } else {
                    throw new Error('No player data in response');
                }

                // Pausa entre requests para respetar rate limits
                await sleep(1000);

            } catch (leagueError) {
                failedRequests++;
                console.error(`❌ Failed to fetch ${league.name}: ${leagueError.message}`);
                
                // Si fallan más de 2 ligas, abortar
                if (failedRequests > 2) {
                    throw new Error('Too many league requests failed - API might be down');
                }
                
                continue; // Continuar con la siguiente liga
            }
        }

        // Validar que tengamos suficientes jugadores
        if (allPlayers.length === 0) {
            throw new Error('No players could be retrieved from any league');
        }

        if (allPlayers.length < 20) {
            console.warn(`⚠️ Only ${allPlayers.length} players retrieved - this might affect variety`);
        }

        // Verificar distribución de rareza
        const rarityCount = {
            Epic: allPlayers.filter(p => p.rarity === 'Epic').length,
            Rare: allPlayers.filter(p => p.rarity === 'Rare').length,
            Common: allPlayers.filter(p => p.rarity === 'Common').length
        };

        console.log('📈 Player rarity distribution:', rarityCount);
        console.log(`🎯 Successfully loaded ${allPlayers.length} players from ${successfulRequests}/${leagues.length} leagues`);
        
        return allPlayers;

    } catch (error) {
        console.error('💥 Critical error in getAllPopularPlayers:', error.message);
        
        // Proporcionar información útil para debugging
        if (error.message.includes('Missing required environment variables')) {
            console.error('🔧 Fix: Add the following to your .env file:');
            console.error('FOOTBALL_API_URL=https://v3.football.api-sports.io');
            console.error('FOOTBALL_API_KEY=your-api-key');
            console.error('FOOTBALL_API_HOST=v3.football.api-sports.io');
        } else if (error.message.includes('Rate limit')) {
            console.error('🕒 Fix: Wait a few minutes before trying again');
        } else if (error.message.includes('Invalid API response')) {
            console.error('🔍 Fix: Check if your API key is valid and has the right permissions');
        }
        
        // Re-lanzar el error para que sea manejado por el comando
        throw error;
    }
};

// Función para normalizar posiciones
const normalizePosition = (position) => {
    if (!position) return 'Player';
    
    const positionMap = {
        'Goalkeeper': 'Goalkeeper',
        'Defender': 'Defender',
        'Midfielder': 'Midfielder', 
        'Attacker': 'Attacker',
        'Forward': 'Attacker'
    };
    
    return positionMap[position] || 'Player';
};

// Función mejorada para calcular rareza
const calculateRarity = (stats) => {
    const goals = stats.goals?.total || 0;
    const assists = stats.goals?.assists || 0;
    const appearances = stats.games?.appearences || 1;
    const rating = parseFloat(stats.games?.rating) || 6.0;
    
    // Calcular métricas
    const goalsPerGame = goals / appearances;
    const assistsPerGame = assists / appearances;
    const totalContributions = goals + assists;
    const contributionsPerGame = totalContributions / appearances;
    
    // Sistema de puntos para rareza
    let rarityScore = 0;
    
    // Puntos por goles
    rarityScore += goalsPerGame * 10;
    
    // Puntos por asistencias  
    rarityScore += assistsPerGame * 7;
    
    // Puntos por rating
    rarityScore += (rating - 6.0) * 5;
    
    // Puntos por apariciones (consistencia)
    if (appearances > 20) rarityScore += 2;
    if (appearances > 30) rarityScore += 3;
    
    // Determinar rareza basada en score
    if (rarityScore >= 12 || totalContributions >= 25) {
        return 'Epic';   // Top performers
    } else if (rarityScore >= 6 || totalContributions >= 10) {
        return 'Rare';   // Good performers  
    } else {
        return 'Common'; // Regular performers
    }
};

module.exports = {
    getAllPopularPlayers
};