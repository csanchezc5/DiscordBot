const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');

// Map para almacenar los cooldowns de usuarios
const cooldowns = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000; // 5 minutos para testing, cambiar a 60 * 60 * 1000 para 1 hora

// Cache de jugadores con gestión más robusta
let playersCache = null;
let lastCacheUpdate = 0;
let isUpdatingCache = false;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 horas (más frecuente para datos actuales)

const getRarity = () => {
    const rand = Math.random() * 100;
    if (rand < 8) return 'Epic';   // 8% Epic (un poco más generoso)
    if (rand < 35) return 'Rare';  // 27% Rare  
    return 'Common'; // 65% Common
};

const getRarityColor = (rarity) => {
    switch (rarity) {
        case 'Epic': return 0x9B59B6;   // Púrpura
        case 'Rare': return 0x3498DB;   // Azul
        case 'Common': return 0x95A5A6; // Gris
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

// Función robusta para obtener jugadores
const getPlayers = async () => {
    const now = Date.now();
    
    // Si hay cache válido, usarlo
    if (playersCache && playersCache.length > 0 && (now - lastCacheUpdate) < CACHE_DURATION) {
        console.log(`✅ Using cached data (${playersCache.length} players)`);
        return playersCache;
    }
    
    // Evitar múltiples actualizaciones simultáneas
    if (isUpdatingCache) {
        console.log('⏳ Cache update in progress, waiting...');
        
        // Esperar hasta 30 segundos por la actualización
        const maxWait = 30000;
        const startWait = Date.now();
        
        while (isUpdatingCache && (Date.now() - startWait) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Si tenemos cache después de esperar, usarlo
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
        
        // Procesar y validar datos
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
                league: player.league || 'Unknown League'
            }))
            .filter(player => 
                player.name !== 'Unknown Player' && 
                player.team !== 'Unknown Team'
            ); // Filtrar datos inválidos
        
        if (playersCache.length === 0) {
            throw new Error('No valid players after processing API data');
        }
        
        lastCacheUpdate = now;
        
        // Mostrar estadísticas del cache
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
        
        // Si tenemos cache viejo, usarlo como respaldo
        if (playersCache && playersCache.length > 0) {
            console.log('⚠️ Using stale cache data as fallback');
            return playersCache;
        }
        
        // Si no hay cache en absoluto, re-lanzar error
        throw new Error(`Unable to load player data: ${error.message}`);
        
    } finally {
        isUpdatingCache = false;
    }
};

// Función mejorada para manejo de errores de base de datos
const handleDatabaseOperation = async (operation, description) => {
    try {
        return await operation();
    } catch (error) {
        console.error(`❌ Database error (${description}):`, error.message);
        // No lanzar error, solo loguearlo - el comando puede continuar
        return null;
    }
};

module.exports = {
    async execute(interaction) {
        // DEFER inmediatamente para evitar timeouts
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

            // Obtener jugadores de la API
            let allPlayers;
            try {
                allPlayers = await getPlayers();
                console.log(`🎮 Loaded ${allPlayers.length} players for selection`);
            } catch (error) {
                console.error('💥 Critical: Could not load any player data:', error.message);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('🚫 Service Temporarily Unavailable')
                    .setDescription('The player database is currently unavailable. This could be due to:\n\n• API maintenance\n• Network connectivity issues\n• Configuration problems')
                    .addFields(
                        { name: '🔧 Admin Info', value: 'Check API configuration and logs' },
                        { name: '⏰ Try Again', value: 'Service should be restored shortly' }
                    )
                    .setFooter({ text: 'We apologize for the inconvenience' })
                    .setTimestamp();
                
                return await interaction.editReply({ embeds: [errorEmbed] });
            }
            
            // Seleccionar rareza y jugador
            const selectedRarity = getRarity();
            console.log(`🎲 Selected rarity: ${selectedRarity}`);
            
            // Filtrar jugadores por rareza
            let availablePlayers = allPlayers.filter(p => p.rarity === selectedRarity);
            console.log(`🔍 Players available for ${selectedRarity}: ${availablePlayers.length}`);
            
            // Si no hay jugadores de esa rareza, intentar con otras
            if (availablePlayers.length === 0) {
                console.log('⚠️ No players for selected rarity, trying alternatives...');
                
                // Intentar Rare primero, luego Common
                for (const fallbackRarity of ['Rare', 'Common', 'Epic']) {
                    availablePlayers = allPlayers.filter(p => p.rarity === fallbackRarity);
                    if (availablePlayers.length > 0) {
                        console.log(`✅ Using ${fallbackRarity} players instead (${availablePlayers.length} available)`);
                        break;
                    }
                }
            }
            
            // Verificación final
            if (availablePlayers.length === 0) {
                throw new Error('No players available for any rarity level');
            }
            
            // Seleccionar jugador aleatorio
            const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
            console.log(`🏆 Selected: ${randomPlayer.name} (${randomPlayer.rarity}) from ${randomPlayer.team}`);

            // Intentar guardar en base de datos (no crítico si falla)
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

                await pool.query(
                    'INSERT INTO user_cards (user_id, player_id) VALUES ($1, $2)',
                    [userId, playerId]
                );
                
                return true;
            }, 'save player card');
            
            if (dbResult) {
                dbSaved = true;
                console.log('✅ Card saved to database');
            } else {
                console.log('⚠️ Card not saved to database, but continuing...');
            }

            // Crear embed de respuesta
            const embed = new EmbedBuilder()
                .setColor(getRarityColor(randomPlayer.rarity))
                .setTitle(`${getRarityEmoji(randomPlayer.rarity)} ${randomPlayer.rarity.toUpperCase()} CARD COLLECTED!`)
                .setDescription(`**${randomPlayer.name}**\n*${randomPlayer.league}*`)
                .addFields(
                    { name: '🏆 Team', value: randomPlayer.team, inline: true },
                    { name: '⚽ Position', value: randomPlayer.position, inline: true },
                    { name: '🌍 Nation', value: randomPlayer.nationality, inline: true },
                    { name: '🎂 Age', value: randomPlayer.age.toString(), inline: true },
                    { name: '⚽ Goals', value: randomPlayer.goals.toString(), inline: true },
                    { name: '🎯 Assists', value: randomPlayer.assists.toString(), inline: true }
                    
                )
                .setThumbnail(randomPlayer.image)
                .setFooter({ 
                    text: `Collected by ${interaction.user.displayName} • Next drop available in ${COOLDOWN_TIME / 60000} minutes${dbSaved ? '' : ' • ⚠️ Not saved to collection'}`,
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            console.log('✅ Card successfully delivered to user');

        } catch (error) {
            console.error('💥 Critical error in drop command:', error);
            
            // Asegurar respuesta al usuario
            try {
                const criticalErrorEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('💥 Critical Error')
                    .setDescription('An unexpected error occurred while processing your card drop.')
                    .addFields(
                        { name: '🔍 Details', value: 'The development team has been notified of this issue.' },
                        { name: '💡 What to do', value: 'Please try again in a few minutes. If the problem persists, contact an administrator.' }
                    )
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