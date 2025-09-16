const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');

// Map para almacenar los cooldowns de usuarios
const cooldowns = new Map();
const COOLDOWN_TIME = 60 * 1000; // 1 hora en milisegundos

// Cache de jugadores (SIEMPRE usar fallback como base)
let playersCache = null;
let lastCacheUpdate = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

const getRarity = () => {
    const rand = Math.random() * 100;
    if (rand < 5) return 'Epic';
    if (rand < 30) return 'Rare';
    return 'Common';
};

const getRarityColor = (rarity) => {
    switch (rarity) {
        case 'Epic': return 0x9B59B6;
        case 'Rare': return 0x3498DB;
        case 'Common': return 0x95A5A6;
        default: return 0x95A5A6;
    }
};

const getRarityEmoji = (rarity) => {
    switch (rarity) {
        case 'Epic': return '🟣';
        case 'Rare': return '🔵';
        case 'Common': return '⚪';
        default: return '⚪';
    }
};

const formatTime = (ms) => {
    const minutes = Math.floor(ms / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
};

const getFallbackPlayers = () => {
    return [
        // Epic players (5%)
        { name: 'Lionel Messi', team: 'Inter Miami', position: 'Attacker', nationality: 'Argentina', age: 36, rarity: 'Epic', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400&h=500&fit=crop&crop=face' },
        { name: 'Kylian Mbappé', team: 'Real Madrid', position: 'Attacker', nationality: 'France', age: 25, rarity: 'Epic', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=500&fit=crop&crop=face' },
        { name: 'Erling Haaland', team: 'Manchester City', position: 'Attacker', nationality: 'Norway', age: 24, rarity: 'Epic', image: 'https://images.unsplash.com/photo-1579952363873-27d3bfad9c0d?w=400&h=500&fit=crop&crop=face' },
        { name: 'Pedri', team: 'Barcelona', position: 'Midfielder', nationality: 'Spain', age: 21, rarity: 'Epic', image: 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=400&h=500&fit=crop&crop=face' },
        { name: 'Jude Bellingham', team: 'Real Madrid', position: 'Midfielder', nationality: 'England', age: 20, rarity: 'Epic', image: 'https://images.unsplash.com/photo-1541801258-ee6c1eeeb6e5?w=400&h=500&fit=crop&crop=face' },
        
        // Rare players (25%)
        { name: 'Cristiano Ronaldo', team: 'Al Nassr', position: 'Attacker', nationality: 'Portugal', age: 38, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=500&fit=crop&crop=face' },
        { name: 'Kevin De Bruyne', team: 'Manchester City', position: 'Midfielder', nationality: 'Belgium', age: 32, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=500&fit=crop&crop=face' },
        { name: 'Mohamed Salah', team: 'Liverpool', position: 'Attacker', nationality: 'Egypt', age: 31, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1506628038767-c09583ff7b08?w=400&h=500&fit=crop&crop=face' },
        { name: 'Luka Modrić', team: 'Real Madrid', position: 'Midfielder', nationality: 'Croatia', age: 38, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=500&fit=crop&crop=face' },
        { name: 'Neymar Jr', team: 'Al Hilal', position: 'Attacker', nationality: 'Brazil', age: 32, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=400&h=500&fit=crop&crop=face' },
        { name: 'Bruno Fernandes', team: 'Manchester United', position: 'Midfielder', nationality: 'Portugal', age: 29, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1582142306909-195724d33be0?w=400&h=500&fit=crop&crop=face' },
        { name: 'Harry Kane', team: 'Bayern Munich', position: 'Attacker', nationality: 'England', age: 30, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=400&h=500&fit=crop&crop=face' },
        { name: 'Vinicius Jr', team: 'Real Madrid', position: 'Attacker', nationality: 'Brazil', age: 24, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1590736969955-71cc94901144?w=400&h=500&fit=crop&crop=face' },
        { name: 'Phil Foden', team: 'Manchester City', position: 'Midfielder', nationality: 'England', age: 24, rarity: 'Rare', image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?w=400&h=500&fit=crop&crop=face' },
        
        // Common players (70%)
        { name: 'Virgil van Dijk', team: 'Liverpool', position: 'Defender', nationality: 'Netherlands', age: 32, rarity: 'Common', image: 'https://images.unsplash.com/photo-1586985289688-ca3cf47d3e6e?w=400&h=500&fit=crop&crop=face' },
        { name: 'Sergio Ramos', team: 'PSG', position: 'Defender', nationality: 'Spain', age: 37, rarity: 'Common', image: 'https://images.unsplash.com/photo-1595666944516-f0991229954b?w=400&h=500&fit=crop&crop=face' },
        { name: 'Manuel Neuer', team: 'Bayern Munich', position: 'Goalkeeper', nationality: 'Germany', age: 37, rarity: 'Common', image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=400&h=500&fit=crop&crop=face' },
        { name: 'Alisson', team: 'Liverpool', position: 'Goalkeeper', nationality: 'Brazil', age: 30, rarity: 'Common', image: 'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=400&h=500&fit=crop&crop=face' },
        { name: 'Thiago Silva', team: 'Chelsea', position: 'Defender', nationality: 'Brazil', age: 39, rarity: 'Common', image: 'https://images.unsplash.com/photo-1594736797933-d0751ba15004?w=400&h=500&fit=crop&crop=face' },
        { name: 'Karim Benzema', team: 'Al Ittihad', position: 'Attacker', nationality: 'France', age: 36, rarity: 'Common', image: 'https://images.unsplash.com/photo-1566577134770-3d85bb3a9cc4?w=400&h=500&fit=crop&crop=face' },
        { name: 'Casemiro', team: 'Manchester United', position: 'Midfielder', nationality: 'Brazil', age: 31, rarity: 'Common', image: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=400&h=500&fit=crop&crop=face' },
        { name: 'N\'Golo Kanté', team: 'Al Ittihad', position: 'Midfielder', nationality: 'France', age: 33, rarity: 'Common', image: 'https://images.unsplash.com/photo-1594736797933-d0501ba15004?w=400&h=500&fit=crop&crop=face' },
        { name: 'Thibaut Courtois', team: 'Real Madrid', position: 'Goalkeeper', nationality: 'Belgium', age: 31, rarity: 'Common', image: 'https://images.unsplash.com/photo-1568393691622-c7ba131d63b4?w=400&h=500&fit=crop&crop=face' },
        { name: 'Gerard Piqué', team: 'Retired', position: 'Defender', nationality: 'Spain', age: 37, rarity: 'Common', image: 'https://images.unsplash.com/photo-1570498601017-bce617ab4ec9?w=400&h=500&fit=crop&crop=face' },
        { name: 'Marcelo', team: 'Fluminense', position: 'Defender', nationality: 'Brazil', age: 35, rarity: 'Common', image: 'https://images.unsplash.com/photo-1625961179667-32b10885ef6c?w=400&h=500&fit=crop&crop=face' },
        { name: 'Jan Oblak', team: 'Atletico Madrid', position: 'Goalkeeper', nationality: 'Slovenia', age: 31, rarity: 'Common', image: 'https://images.unsplash.com/photo-1566577739114-d9b1d93d0ad4?w=400&h=500&fit=crop&crop=face' },
        { name: 'Dani Alves', team: 'Retired', position: 'Defender', nationality: 'Brazil', age: 40, rarity: 'Common', image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop&crop=face' },
        { name: 'Jordi Alba', team: 'Inter Miami', position: 'Defender', nationality: 'Spain', age: 34, rarity: 'Common', image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=500&fit=crop&crop=face' },
        { name: 'Sergio Busquets', team: 'Inter Miami', position: 'Midfielder', nationality: 'Spain', age: 35, rarity: 'Common', image: 'https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=400&h=500&fit=crop&crop=face' },
        { name: 'Luka Jović', team: 'AC Milan', position: 'Attacker', nationality: 'Serbia', age: 26, rarity: 'Common', image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=400&h=500&fit=crop&crop=face' },
        { name: 'Raphaël Varane', team: 'Manchester United', position: 'Defender', nationality: 'France', age: 30, rarity: 'Common', image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=400&h=500&fit=crop&crop=face' },
        { name: 'Antoine Griezmann', team: 'Atletico Madrid', position: 'Attacker', nationality: 'France', age: 33, rarity: 'Common', image: 'https://images.unsplash.com/photo-1595666944516-f0991559954b?w=400&h=500&fit=crop&crop=face' }
    ];
};

// Función simple para obtener jugadores - SIEMPRE funciona
const getPlayers = () => {
    const now = Date.now();
    
    // Si no hay cache o está vencido, "actualizar"
    if (playersCache === null || (now - lastCacheUpdate) > CACHE_DURATION) {
        console.log('🔄 Refreshing player data...');
        
        // Por ahora, SIEMPRE usar fallback hasta que tu API esté configurada correctamente
        playersCache = getFallbackPlayers();
        lastCacheUpdate = now;
        
        console.log(`✅ Loaded ${playersCache.length} players (local database)`);
        
        // TODO: Cuando tengas la API funcionando, descomenta esta parte:
        /*
        try {
            const { getAllPopularPlayers } = require('../services/footballAPI.js');
            const apiPlayers = await getAllPopularPlayers();
            if (apiPlayers && apiPlayers.length > 0) {
                playersCache = apiPlayers.map(player => ({
                    name: player.name,
                    team: player.team,
                    position: player.position,
                    nationality: player.nationality || 'Unknown',
                    age: player.age || 25,
                    image: player.photo || `https://via.placeholder.com/300x400/95A5A6/FFFFFF?text=${encodeURIComponent(player.name)}`,
                    rarity: assignRarityToPlayer(player)
                }));
                console.log(`✅ Loaded ${playersCache.length} players from API`);
            } else {
                throw new Error('No API data available');
            }
        } catch (error) {
            console.log(`⚠️  API failed, using offline data: ${error.message}`);
            playersCache = getFallbackPlayers();
        }
        */
    }
    
    return playersCache;
};

module.exports = {
    async execute(interaction) {
        // DEFER INMEDIATAMENTE - esto es crítico
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            const now = Date.now();
            
            // Verificar cooldown
            if (cooldowns.has(userId)) {
                const expirationTime = cooldowns.get(userId) + COOLDOWN_TIME;
                
                if (now < expirationTime) {
                    const timeLeft = expirationTime - now;
                    
                    const cooldownEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle('⏰ Cooldown Active')
                        .setDescription(`You need to wait **${formatTime(timeLeft)}** before collecting another card!`)
                        .setFooter({ text: 'Try again later!' });
                    
                    return await interaction.editReply({ embeds: [cooldownEmbed] });
                }
            }

            // Establecer nuevo cooldown
            cooldowns.set(userId, now);

            // Obtener jugadores (SIEMPRE funciona)
            const allPlayers = getPlayers();
            console.log(`🎮 Available players: ${allPlayers.length}`);
            
            const rarity = getRarity();
            console.log(`🎲 Selected rarity: ${rarity}`);
            
            // Filtrar jugadores por rareza
            let availablePlayers = allPlayers.filter(p => p.rarity === rarity);
            console.log(`🔍 Players for ${rarity}: ${availablePlayers.length}`);
            
            // Si no hay jugadores de esa rareza (no debería pasar), usar Common como fallback
            if (availablePlayers.length === 0) {
                console.log('⚠️  No players for rarity, using Common as fallback');
                availablePlayers = allPlayers.filter(p => p.rarity === 'Common');
            }
            
            // Si TODAVÍA no hay jugadores, usar el primero disponible
            if (availablePlayers.length === 0) {
                console.log('⚠️  Using first available player');
                availablePlayers = [allPlayers[0]];
            }
            
            const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
            console.log(`🏆 Selected player: ${randomPlayer.name} (${randomPlayer.rarity})`);

            // Base de datos con mejor manejo de errores
            try {
                let playerResult = await pool.query('SELECT id FROM players WHERE name = $1', [randomPlayer.name]);

                let playerId;
                if (playerResult.rows.length > 0) {
                    playerId = playerResult.rows[0].id;
                } else {
                    const newPlayer = await pool.query(
                        'INSERT INTO players (name, team, position, nationality, rarity, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                        [randomPlayer.name, randomPlayer.team, randomPlayer.position, randomPlayer.nationality, randomPlayer.rarity, randomPlayer.image]
                    );
                    playerId = newPlayer.rows[0].id;
                }

                await pool.query(
                    'INSERT INTO user_cards (user_id, player_id) VALUES ($1, $2)',
                    [userId, playerId]
                );
                
                console.log('✅ Database updated successfully');
            } catch (dbError) {
                console.error('❌ Database error:', dbError);
                // Continuar aunque falle la DB - el usuario al menos ve la carta
            }

            // Crear embed
            const embed = new EmbedBuilder()
                .setColor(getRarityColor(randomPlayer.rarity))
                .setTitle(`${getRarityEmoji(randomPlayer.rarity)} ${randomPlayer.rarity.toUpperCase()} CARD OBTAINED!`)
                .setDescription(`**${randomPlayer.name}**`)
                .addFields(
                    { name: '🏆 Team', value: randomPlayer.team, inline: true },
                    { name: '⚽ Position', value: randomPlayer.position, inline: true },
                    { name: '🌍 Nationality', value: randomPlayer.nationality, inline: true },
                    { name: '🎂 Age', value: randomPlayer.age.toString(), inline: true }
                )
                .setThumbnail(randomPlayer.image)
                .setFooter({ 
                    text: `Collected by ${interaction.user.displayName} • Next drop in 1 hour`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log('✅ Card successfully sent to user');

        } catch (error) {
            console.error('❌ Critical error in drop command:', error);
            
            try {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('⚠️ Error')
                    .setDescription('Something went wrong while collecting your card. Please try again!')
                    .setFooter({ text: 'If this persists, contact an admin.' });
                
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
    }
};