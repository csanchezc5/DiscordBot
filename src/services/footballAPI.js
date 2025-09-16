const axios = require('axios');

const API_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: {
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
    }
});

// IDs de equipos populares
const POPULAR_TEAMS = {
    'Real Madrid': 541,
    'Barcelona': 529,
    'Manchester City': 50,
    'Arsenal': 42,
    'Chelsea': 49,
    'Liverpool': 40,
    'PSG': 85,
    'Bayern Munich': 157
};

const getPlayersFromTeam = async (teamId, season = 2023) => {
    try {
        const response = await apiClient.get('/players/squads', {
            params: {
                team: teamId
            }
        });
        
        return response.data.response[0]?.players || [];
    } catch (error) {
        console.error('Error fetching players:', error.response?.data || error.message);
        return [];
    }
};

const getAllPopularPlayers = async () => {
    const allPlayers = [];
    
    for (const [teamName, teamId] of Object.entries(POPULAR_TEAMS)) {
        console.log(`Fetching players from ${teamName}...`);
        const players = await getPlayersFromTeam(teamId);
        
        // Agregar info del equipo
        const playersWithTeam = players.map(player => ({
            ...player,
            team: teamName
        }));
        
        allPlayers.push(...playersWithTeam);
        
        // Delay para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return allPlayers;
};

module.exports = {
    getPlayersFromTeam,
    getAllPopularPlayers,
    POPULAR_TEAMS
};