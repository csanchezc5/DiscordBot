const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');
const crypto = require('crypto');

// Map para almacenar los cooldowns de usuarios
const cooldowns = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutos para testing

// Cache de jugadores
let playersCache = null;
let lastCacheUpdate = 0;
let isUpdatingCache = false;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 horas

// Función para generar ID único de carta
const generateCardID = () => {
    const timestamp = Date.now().toString(36); // Base36 timestamp (más corto)
    const randomBytes = crypto.randomBytes(3).toString('hex'); // 6 caracteres hex
    return `${timestamp}${randomBytes}`.toUpperCase().substring(0, 12);
};

// Función para verificar si un ID ya existe (por seguridad)
const ensureUniqueCardID = async () => {
    let cardId;
    let attempts = 0;
    const maxAttempts = 5;

    do {
        cardId = generateCardID();
        attempts++;
        
        try {
            const existing = await pool.query('SELECT card_id FROM user_cards WHERE card_id = $1', [cardId]);
            if (existing.rows.length === 0) {
                break; // ID único encontrado
            }
        } catch (error) {
            console.error('Error verificando unicidad del ID:', error);
            // Si hay error en DB, usar el ID generado
            break;
        }
    } while (attempts < maxAttempts);

    return cardId;
};

const getRarity = () => {
    const rand = Math.random() * 100;
    if (rand < 8) return 'Epic';
    if (rand < 35) return 'Rare';
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

// Función para obtener estrellas basadas en rareza
const getRarityStars = (rarity) => {
    switch (rarity) {
        case 'Epic': return ':star::star::star:';
        case 'Rare': return ':star::star:';
        case 'Common': return ':star:';
        default: return ':star:';
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

// Función para obtener jugadores
const getPlayers = async () => {
    const now = Date.now();
    
    if (playersCache && playersCache.length > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
        console.log(`✅ Using cached data (${playersCache.length} players)`);
        return playersCache;
    }
    
    if (isUpdatingCache) {
        console.log('⏳ Cache update in progress, waiting...');
        const maxWait = 30000;
        const startWait = Date.now();
        
        while (isUpdatingCache && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (playersCache && playersCache.length > 0) {
            return playersCache;
        }
    }
    
    isUpdatingCache = true;
    
    try {
        console.log('🔄 Refreshing player data from API...');
        
        const { getAllPopularPlayers } = require('../services/footballAPI.js');
        const apiPlayers = await getAllPopularPlayers();
        
        if (!apiPlayers || !Array.isArray(apiPlayers) || apiPlayers.length === 0) {
            throw new Error('No valid player data received from API');
        }
        
        playersCache = apiPlayers
            .map(player => ({
                name: player.name || 'Unknown Player',
                team: player.team || 'Unknown Team',
                position: player.position || 'Player',
                nationality: player.nationality || 'Unknown',
                age: Number(player.age) || 25,
                image: player.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name || 'Player')}&size=400&background=3498db&color=ffffff`,
                rarity: player.rarity || 'Common',
                goals: Number(player.goals) || 0,
                assists: Number(player.assists) || 0,
                league: player.league && player.league !== 'Unknown League' ? player.league : null
            }))
            .filter(player => 
                player.name !== 'Unknown Player' && 
                player.team !== 'Unknown Team'
            );
        
        if (playersCache.length === 0) {
            throw new Error('No valid players after processing API data');
        }
        
        lastCacheUpdate = now;
        
        const rarityStats = {
            Epic: playersCache.filter(p => p.rarity === 'Epic').length,
            Rare: playersCache.filter(p => p.rarity === 'Rare').length,
            Common: playersCache.filter(p => p.rarity === 'Common').length
        };
        
        console.log(`✅ Cache updated: ${playersCache.length} players`);
        console.log(`📊 Rarity distribution: Epic(${rarityStats.Epic}) Rare(${rarityStats.Rare}) Common(${rarityStats.Common})`);
        
        return playersCache;
        
    } catch (error) {
        console.error('❌ Failed to update player cache:', error.message);
        
        if (playersCache && playersCache.length > 0) {
            console.log('⚠️ Using stale cache data as fallback');
            return playersCache;
        }
        
        throw new Error(`Unable to load player data: ${error.message}`);
        
    } finally {
        isUpdatingCache = false;
    }
};

const handleDatabaseOperation = async (operation, description) => {
    try {
        return await operation();
    } catch (error) {
        console.error(`❌ Database error (${description}):`, error.message);
        return null;
    }
};

module.exports = {
    async execute(interaction) {
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
                        .setFooter({ text: 'Cards are more valuable when rare!' })
                        .setTimestamp();
                    
                    return await interaction.editReply({ embeds: [cooldownEmbed] });
                }
            }

            // Establecer nuevo cooldown
            cooldowns.set(userId, now);

            // Obtener jugadores
            let allPlayers;
            try {
                allPlayers = await getPlayers();
                console.log(`🎮 Loaded ${allPlayers.length} players for selection`);
            } catch (error) {
                console.error('💥 Critical: Could not load any player data:', error.message);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('🚫 Service Temporarily Unavailable')
                    .setDescription('The player database is currently unavailable. Please try again later.')
                    .setTimestamp();
                
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            // Seleccionar rareza y jugador
            const selectedRarity = getRarity();
            console.log(`🎲 Selected rarity: ${selectedRarity}`);
            
            let availablePlayers = allPlayers.filter(p => p.rarity === selectedRarity);
            console.log(`🔍 Players available for ${selectedRarity}: ${availablePlayers.length}`);
            
            if (availablePlayers.length === 0) {
                console.log('⚠️ No players for selected rarity, trying alternatives...');
                
                for (const fallbackRarity of ['Rare', 'Common', 'Epic']) {
                    availablePlayers = allPlayers.filter(p => p.rarity === fallbackRarity);
                    if (availablePlayers.length > 0) {
                        console.log(`✅ Using ${fallbackRarity} players instead (${availablePlayers.length} available)`);
                        break;
                    }
                }
            }
            
            if (availablePlayers.length === 0) {
                throw new Error('No players available for any rarity level');
            }
            
            const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
            console.log(`🏆 Selected: ${randomPlayer.name} (${randomPlayer.rarity}) from ${randomPlayer.team}`);

            // Generar ID único para la carta
            const cardId = await ensureUniqueCardID();
            console.log(`🆔 Generated card ID: ${cardId}`);

            // Guardar en base de datos
            let dbSaved = false;
            const dbResult = await handleDatabaseOperation(async () => {
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

                // Insertar carta con ID único
                await pool.query(
                    'INSERT INTO user_cards (card_id, user_id, player_id, goals, assists, league) VALUES ($1, $2, $3, $4, $5, $6)',
                    [cardId, userId, playerId, randomPlayer.goals, randomPlayer.assists, randomPlayer.league]
                );
                
                return true;
            }, 'save player card');
            
            if (dbResult) {
                dbSaved = true;
                console.log('✅ Card saved to database with ID:', cardId);
            } else {
                console.log('⚠️ Card not saved to database, but continuing...');
            }

            // Crear embed de respuesta con estrellas
            const stars = getRarityStars(randomPlayer.rarity);
            const embed = new EmbedBuilder()
                .setColor(getRarityColor(randomPlayer.rarity))
                .setTitle(`${stars} ${randomPlayer.rarity.toUpperCase()} CARD COLLECTED!`)
                .setDescription(`**${randomPlayer.name}**\n*${randomPlayer.league || 'International League'}*`)
                .addFields(
                    { name: '🆔 Card ID', value: `\`${cardId}\``, inline: true },
                    { name: '🏆 Team', value: randomPlayer.team, inline: true },
                    { name: '⚽ Position', value: randomPlayer.position, inline: true },
                    { name: '🌍 Nation', value: randomPlayer.nationality, inline: true },
                    { name: '🎂 Age', value: randomPlayer.age.toString(), inline: true },
                    { name: '⚽ Goals', value: randomPlayer.goals.toString(), inline: true },
                    { name: '🎯 Assists', value: randomPlayer.assists.toString(), inline: true }
                )
                .setThumbnail(randomPlayer.image)
                .setFooter({ 
                    text: `Collected by ${interaction.user.displayName} • Card ID: ${cardId}${dbSaved ? '' : ' • ⚠️ Not saved to collection'}`,
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log('✅ Card successfully delivered to user with ID:', cardId);

        } catch (error) {
            console.error('💥 Critical error in drop command:', error);
            
            try {
                const criticalErrorEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('💥 Critical Error')
                    .setDescription('An unexpected error occurred while processing your card drop.')
                    .setFooter({ text: 'Error ID: ' + Date.now().toString(36) })
                    .setTimestamp();
                
                if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({ embeds: [criticalErrorEmbed] });
                } else if (!interaction.replied) {
                    await interaction.reply({ embeds: [criticalErrorEmbed] });
                }
            } catch (replyError) {
                console.error('💥 Failed to send error response:', replyError);
            }
        }
    }
};