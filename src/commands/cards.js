const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');

// Función para obtener estrellas basadas en rareza
const getRarityStars = (rarity) => {
    switch (rarity) {
        case 'Epic': return ':star::star::star:';
        case 'Rare': return ':star::star:';
        case 'Common': return ':star:';
        default: return ':star:';
    }
};

module.exports = {
    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            // Obtener todas las cartas del usuario con información del jugador e IDs
            const userCards = await pool.query(`
                SELECT uc.card_id, p.name, p.team, p.position, p.nationality, p.rarity, p.image_url,
                       uc.collected_at, uc.goals, uc.assists, uc.league,
                       COUNT(*) OVER() as total_count
                FROM user_cards uc
                JOIN players p ON uc.player_id = p.id
                WHERE uc.user_id = $1
                ORDER BY uc.collected_at DESC
                LIMIT 20
            `, [userId]);

            if (userCards.rows.length === 0) {
                const noCardsEmbed = new EmbedBuilder()
                    .setColor(0x95A5A6)
                    .setTitle('📦 Empty Collection')
                    .setDescription('You don\'t have any cards yet! Use `/drop` to collect your first card.')
                    .setFooter({ text: 'Start collecting now!' });

                return await interaction.reply({ embeds: [noCardsEmbed] });
            }

            const totalCards = userCards.rows.length > 0 ? parseInt(userCards.rows[0].total_count) : 0;

            // Crear embed principal
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`⚽ ${interaction.user.displayName}'s Collection`)
                .setDescription(`**Total Cards: ${totalCards}**`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            // Agregar las cartas como fields con sistema de estrellas
            const cardsToShow = userCards.rows.slice(0, 12);
            cardsToShow.forEach((card, index) => {
                const stars = getRarityStars(card.rarity);
                const leagueDisplay = card.league || 'International League';
                
                embed.addFields({
                    name: `${card.name} ${stars}`,
                    value: `${card.team} • ${leagueDisplay}\n${card.position}\n\`${card.card_id}\``,
                    inline: true
                });
            });

            if (totalCards > 12) {
                embed.setFooter({ 
                    text: `Showing 12 of ${totalCards} cards • Use card IDs for trading`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            } else {
                embed.setFooter({ 
                    text: `Collection by ${interaction.user.displayName} • Use card IDs for trading`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error en collection:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Error')
                .setDescription('Could not load your collection. Please try again.')
                .setTimestamp();
                
            await interaction.reply({ embeds: [errorEmbed] });
        }
    }
};