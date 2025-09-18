const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const pool = require('../database.js');

const getRarityStars = (rarity) => {
    switch (rarity) {
        case 'Epic': return '⭐⭐⭐';
        case 'Rare': return '⭐⭐';
        case 'Common': return '⭐';
        default: return '⭐';
    }
};

const CARDS_PER_PAGE = 10;

const createCollectionEmbed = (cards, totalCards, currentPage, totalPages, user) => {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle(`⚽ ${user.displayName}'s Collection`)
        .setDescription(`**Total Cards: ${totalCards}**`)
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp();

    cards.forEach((card, index) => {
        const stars = getRarityStars(card.rarity);
        const leagueDisplay = card.league || 'International League';
        
        embed.addFields({
            name: `${stars} ${card.name}`,
            value: `${card.team} • ${leagueDisplay}\n${card.position}\n\`${card.card_id}\``,
            inline: true
        });

        if ((index + 1) % 2 === 0) {
            embed.addFields({ name: '\u200b', value: '\u200b', inline: true });
        }
    });

    embed.setFooter({ 
        text: `Page ${currentPage}/${totalPages} • ${cards.length} of ${totalCards} cards • Use card IDs for trading`,
        iconURL: user.displayAvatarURL()
    });

    return embed;
};

const createNavigationButtons = (currentPage, totalPages, userId) => {
    const firstButton = new ButtonBuilder()
        .setCustomId(`collection_first_${userId}`)
        .setEmoji('⏪')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1);

    const prevButton = new ButtonBuilder()
        .setCustomId(`collection_prev_${userId}`)
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 1);

    const closeButton = new ButtonBuilder()
        .setCustomId(`collection_close_${userId}`)
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary);

    const nextButton = new ButtonBuilder()
        .setCustomId(`collection_next_${userId}`)
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages);

    const lastButton = new ButtonBuilder()
        .setCustomId(`collection_last_${userId}`)
        .setEmoji('⏩')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages);

    return new ActionRowBuilder().addComponents(
        firstButton, prevButton, closeButton, nextButton, lastButton
    );
};

module.exports = {
    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const page = 1; 

            const totalResult = await pool.query(`
                SELECT COUNT(*) as total
                FROM user_cards uc
                WHERE uc.user_id = $1
            `, [userId]);

            const totalCards = parseInt(totalResult.rows[0].total);

            if (totalCards === 0) {
                const noCardsEmbed = new EmbedBuilder()
                    .setColor(0x95A5A6)
                    .setTitle('📦 Empty Collection')
                    .setDescription('You don\'t have any cards yet! Use `/drop` to collect your first card.')
                    .setFooter({ text: 'Start collecting now!' });

                return await interaction.reply({ embeds: [noCardsEmbed] });
            }

            const totalPages = Math.ceil(totalCards / CARDS_PER_PAGE);
            const offset = (page - 1) * CARDS_PER_PAGE;

            const userCards = await pool.query(`
                SELECT uc.card_id, p.name, p.team, p.position, p.nationality, p.rarity, p.image_url,
                       uc.collected_at, uc.goals, uc.assists, uc.league
                FROM user_cards uc
                JOIN players p ON uc.player_id = p.id
                WHERE uc.user_id = $1
                ORDER BY uc.collected_at DESC
                LIMIT $2 OFFSET $3
            `, [userId, CARDS_PER_PAGE, offset]);

            const embed = createCollectionEmbed(userCards.rows, totalCards, page, totalPages, interaction.user);
            const buttons = createNavigationButtons(page, totalPages, userId);

            const response = await interaction.reply({ 
                embeds: [embed], 
                components: totalPages > 1 ? [buttons] : []
            });

            if (totalPages > 1) {
                const collector = response.createMessageComponentCollector({ 
                    time: 5 * 60 * 1000 // 5 minutos
                });

                collector.on('collect', async (buttonInteraction) => {
                    if (buttonInteraction.user.id !== userId) {
                        return await buttonInteraction.reply({ 
                            content: '❌ You can only navigate your own collection!', 
                            ephemeral: true 
                        });
                    }

                    let newPage = page;
                    const customId = buttonInteraction.customId;

                    if (customId.startsWith('collection_first_')) {
                        newPage = 1;
                    } else if (customId.startsWith('collection_prev_')) {
                        const currentEmbed = buttonInteraction.message.embeds[0];
                        const footerText = currentEmbed.footer.text;
                        const pageMatch = footerText.match(/Page (\d+)\/\d+/);
                        const currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;
                        newPage = Math.max(1, currentPage - 1);
                    } else if (customId.startsWith('collection_next_')) {
                        const currentEmbed = buttonInteraction.message.embeds[0];
                        const footerText = currentEmbed.footer.text;
                        const pageMatch = footerText.match(/Page (\d+)\/\d+/);
                        const currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;
                        newPage = Math.min(totalPages, currentPage + 1);
                    } else if (customId.startsWith('collection_last_')) {
                        newPage = totalPages;
                    } else if (customId.startsWith('collection_close_')) {
                        const closedEmbed = new EmbedBuilder()
                            .setColor(0x95A5A6)
                            .setTitle('📦 Collection Closed')
                            .setDescription('Collection view has been closed.')
                            .setTimestamp();

                        return await buttonInteraction.update({ 
                            embeds: [closedEmbed], 
                            components: [] 
                        });
                    }

                    const newOffset = (newPage - 1) * CARDS_PER_PAGE;
                    const newCards = await pool.query(`
                        SELECT uc.card_id, p.name, p.team, p.position, p.nationality, p.rarity, p.image_url,
                               uc.collected_at, uc.goals, uc.assists, uc.league
                        FROM user_cards uc
                        JOIN players p ON uc.player_id = p.id
                        WHERE uc.user_id = $1
                        ORDER BY uc.collected_at DESC
                        LIMIT $2 OFFSET $3
                    `, [userId, CARDS_PER_PAGE, newOffset]);

                    const newEmbed = createCollectionEmbed(newCards.rows, totalCards, newPage, totalPages, interaction.user);
                    const newButtons = createNavigationButtons(newPage, totalPages, userId);

                    await buttonInteraction.update({ 
                        embeds: [newEmbed], 
                        components: [newButtons] 
                    });
                });

                collector.on('end', () => {
                    const disabledButtons = createNavigationButtons(1, totalPages, userId);
                    disabledButtons.components.forEach(button => button.setDisabled(true));
                    
                    response.edit({ components: [disabledButtons] }).catch(console.error);
                });
            }

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