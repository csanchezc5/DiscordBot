const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

const getRarityColor = (rarity) => {
    switch (rarity) {
        case 'Epic': return 0x9B59B6;
        case 'Rare': return 0x3498DB;
        case 'Common': return 0x95A5A6;
        default: return 0x95A5A6;
    }
};

module.exports = {
    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const cardId = interaction.options.getString('card_id');
            
            let cardQuery;
            let queryParams;

            if (cardId) {
                // Buscar carta por ID específico
                cardQuery = `
                    SELECT uc.id, uc.card_id, p.name, p.team, p.position, p.nationality, 
                           p.rarity, p.image_url, uc.collected_at, uc.goals, uc.assists, uc.league
                    FROM user_cards uc
                    JOIN players p ON uc.player_id = p.id
                    WHERE uc.user_id = $1 AND uc.card_id = $2
                `;
                queryParams = [userId, cardId.toUpperCase()];
            } else {
                // Buscar la última carta del usuario
                cardQuery = `
                    SELECT uc.id, uc.card_id, p.name, p.team, p.position, p.nationality, 
                           p.rarity, p.image_url, uc.collected_at, uc.goals, uc.assists, uc.league
                    FROM user_cards uc
                    JOIN players p ON uc.player_id = p.id
                    WHERE uc.user_id = $1
                    ORDER BY uc.collected_at DESC
                    LIMIT 1
                `;
                queryParams = [userId];
            }

            const result = await pool.query(cardQuery, queryParams);

            if (result.rows.length === 0) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('🔍 Card Not Found')
                    .setDescription(cardId ? 
                        `No card found with ID: \`${cardId.toUpperCase()}\`` : 
                        'You don\'t have any cards to burn.')
                    .setTimestamp();

                return await interaction.reply({ embeds: [notFoundEmbed], ephemeral: true });
            }

            const card = result.rows[0];
            const stars = getRarityStars(card.rarity);
            const leagueDisplay = card.league || 'International League';

            // Crear embed de confirmación
            const confirmEmbed = new EmbedBuilder()
                .setColor(getRarityColor(card.rarity))
                .setTitle(`🔥 Confirm Card Burn`)
                .setDescription('**Are you sure you want to burn this card?**\n*This action cannot be undone!*')
                .addFields(
                    { name: `${card.name} ${stars}`, value: `${card.team} • ${leagueDisplay}\n${card.position}`, inline: true },
                    { name: '🆔 Card ID', value: `\`${card.card_id}\``, inline: true },
                    { name: '🌍 Nation', value: card.nationality, inline: true }
                )
                .setThumbnail(card.image_url)
                .setFooter({ text: `Collected on ${new Date(card.collected_at).toLocaleDateString()}` })
                .setTimestamp();

            // Si tiene estadísticas, agregarlas
            if (card.goals > 0 || card.assists > 0) {
                confirmEmbed.addFields(
                    { name: '⚽ Goals', value: card.goals.toString(), inline: true },
                    { name: '🎯 Assists', value: card.assists.toString(), inline: true }
                );
            }

            // Crear botones de confirmación
            const confirmButton = new ButtonBuilder()
                .setCustomId(`burn_confirm_${card.id}`)
                .setLabel('🔥 Burn Card')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('burn_cancel')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            const response = await interaction.reply({ 
                embeds: [confirmEmbed], 
                components: [actionRow], 
                ephemeral: true 
            });

            // Crear collector para los botones
            const collectorFilter = (i) => {
                return (i.customId === `burn_confirm_${card.id}` || i.customId === 'burn_cancel') && 
                       i.user.id === interaction.user.id;
            };

            try {
                const confirmation = await response.awaitMessageComponent({ 
                    filter: collectorFilter, 
                    time: 60000 
                });

                if (confirmation.customId === `burn_confirm_${card.id}`) {
                    // Eliminar la carta de la base de datos
                    await pool.query('DELETE FROM user_cards WHERE id = $1', [card.id]);

                    const burnedEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle('🔥 Card Burned Successfully')
                        .setDescription(`**${card.name}** ${stars} has been burned and removed from your collection.`)
                        .addFields(
                            { name: '🆔 Burned Card ID', value: `\`${card.card_id}\``, inline: true },
                            { name: '🏆 Team', value: card.team, inline: true }
                        )
                        .setTimestamp();

                    await confirmation.update({ 
                        embeds: [burnedEmbed], 
                        components: [] 
                    });

                } else if (confirmation.customId === 'burn_cancel') {
                    const canceledEmbed = new EmbedBuilder()
                        .setColor(0x95A5A6)
                        .setTitle('❌ Burn Canceled')
                        .setDescription(`The burn operation was canceled. **${card.name}** ${stars} remains in your collection.`)
                        .setTimestamp();

                    await confirmation.update({ 
                        embeds: [canceledEmbed], 
                        components: [] 
                    });
                }

            } catch (error) {
                console.error('Button interaction timeout or error:', error);
                
                const timeoutEmbed = new EmbedBuilder()
                    .setColor(0x95A5A6)
                    .setTitle('⏰ Confirmation Timeout')
                    .setDescription('The burn confirmation timed out. No cards were harmed.')
                    .setTimestamp();

                try {
                    await interaction.editReply({ 
                        embeds: [timeoutEmbed], 
                        components: [] 
                    });
                } catch (editError) {
                    console.error('Error updating interaction after timeout:', editError);
                }
            }

        } catch (error) {
            console.error('Error in burn command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the burn command. Please try again.')
                .setTimestamp();

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({ embeds: [errorEmbed], components: [] });
                } else {
                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    }
};