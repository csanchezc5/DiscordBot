const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');

// Map para almacenar los cooldowns de usuarios
const cooldowns = new Map();
const COOLDOWN_TIME = 60 * 1000; // 1 hora en milisegundos

// Datos de ejemplo de jugadores
const samplePlayers = [
    { name: 'Lionel Messi', team: 'Inter Miami', position: 'Forward', nationality: 'Argentina', rarity: 'Epic', image: 'https://via.placeholder.com/300x400/FF6B6B/FFFFFF?text=Messi' },
    { name: 'Cristiano Ronaldo', team: 'Al Nassr', position: 'Forward', nationality: 'Portugal', rarity: 'Epic', image: 'https://via.placeholder.com/300x400/4ECDC4/FFFFFF?text=Ronaldo' },
    { name: 'Kylian Mbappé', team: 'PSG', position: 'Forward', nationality: 'France', rarity: 'Rare', image: 'https://via.placeholder.com/300x400/45B7D1/FFFFFF?text=Mbappe' },
    { name: 'Erling Haaland', team: 'Manchester City', position: 'Forward', nationality: 'Norway', rarity: 'Rare', image: 'https://via.placeholder.com/300x400/96CEB4/FFFFFF?text=Haaland' },
    { name: 'Pedri', team: 'Barcelona', position: 'Midfielder', nationality: 'Spain', rarity: 'Common', image: 'https://via.placeholder.com/300x400/FFEAA7/000000?text=Pedri' },
    { name: 'Gavi', team: 'Barcelona', position: 'Midfielder', nationality: 'Spain', rarity: 'Common', image: 'https://via.placeholder.com/300x400/DDA0DD/000000?text=Gavi' }
];

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

module.exports = {
    async execute(interaction) {
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
                    
                    return await interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
                }
            }

            // Establecer nuevo cooldown
            cooldowns.set(userId, now);

            const rarity = getRarity();
            
            // Filtrar jugadores por rareza obtenida
            const availablePlayers = samplePlayers.filter(p => p.rarity === rarity);
            const randomPlayer = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

            // Lógica de base de datos
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

            // Crear embed
            const embed = new EmbedBuilder()
                .setColor(getRarityColor(rarity))
                .setTitle(`${getRarityEmoji(rarity)} ${rarity.toUpperCase()} CARD OBTAINED!`)
                .setDescription(`**${randomPlayer.name}**`)
                .addFields(
                    { name: '🏆 Team', value: randomPlayer.team, inline: true },
                    { name: '⚽ Position', value: randomPlayer.position, inline: true },
                    { name: '🌍 Nationality', value: randomPlayer.nationality, inline: true }
                )
                .setThumbnail(randomPlayer.image)
                .setFooter({ 
                    text: `Collected by ${interaction.user.displayName} • Next drop in 1 hour`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error en drop:', error);
            await interaction.reply('Error al recolectar carta.');
        }
    }
};