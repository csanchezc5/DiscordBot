const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const pool = require('../database.js');

// Map para almacenar trades activos
const activeTrades = new Map();

// Función para resolver usuario por texto (mención, ID, username o nickname)
const resolveUser = async (interaction, userInput) => {
    const guild = interaction.guild;
    if (!guild) return null;

    // Si es una mención <@123456789>
    const mentionMatch = userInput.match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
        try {
            return await guild.members.fetch(mentionMatch[1]);
        } catch {
            return null;
        }
    }

    // Si es un ID directo
    if (/^\d+$/.test(userInput)) {
        try {
            return await guild.members.fetch(userInput);
        } catch {
            return null;
        }
    }

    // Buscar por username o nickname
    const lowerInput = userInput.toLowerCase();
    
    // Primero intentar obtener todos los miembros del servidor
    try {
        await guild.members.fetch();
    } catch (error) {
        console.log('Could not fetch all members, searching in cache only');
    }

    // Buscar coincidencias exactas primero
    let member = guild.members.cache.find(member => 
        member.user.username.toLowerCase() === lowerInput ||
        member.user.globalName?.toLowerCase() === lowerInput ||
        member.displayName.toLowerCase() === lowerInput
    );

    if (member) return member;

    // Si no hay coincidencia exacta, buscar que contenga el texto
    member = guild.members.cache.find(member => 
        member.user.username.toLowerCase().includes(lowerInput) ||
        member.user.globalName?.toLowerCase().includes(lowerInput) ||
        member.displayName.toLowerCase().includes(lowerInput)
    );

    return member || null;
};
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

// Función para obtener información de una carta
const getCardInfo = async (userId, cardId) => {
    const result = await pool.query(`
        SELECT uc.id, uc.card_id, p.name, p.team, p.position, p.nationality, 
               p.rarity, p.image_url, uc.collected_at, uc.goals, uc.assists, uc.league
        FROM user_cards uc
        JOIN players p ON uc.player_id = p.id
        WHERE uc.user_id = $1 AND uc.card_id = $2
    `, [userId, cardId.toUpperCase()]);

    return result.rows.length > 0 ? result.rows[0] : null;
};

// Función para crear embed de carta
const createCardEmbed = (card, title) => {
    const stars = getRarityStars(card.rarity);
    const leagueDisplay = card.league || 'International League';
    
    return new EmbedBuilder()
        .setColor(getRarityColor(card.rarity))
        .setTitle(title)
        .addFields(
            { name: `${card.name} ${stars}`, value: `${card.team} • ${leagueDisplay}\n${card.position}`, inline: true },
            { name: '🆔 Card ID', value: `\`${card.card_id}\``, inline: true },
            { name: '🌍 Nation', value: card.nationality, inline: true }
        )
        .setThumbnail(card.image_url);
};

module.exports = {
    async execute(interaction) {
        try {
            const initiatorId = interaction.user.id;
            const targetUser = interaction.options.getUser('user');
            const offerCardId = interaction.options.getString('offer_card');
            const requestCardId = interaction.options.getString('request_card');

            // Validaciones básicas
            if (targetUser.id === initiatorId) {
                return await interaction.reply({ 
                    content: '❌ You cannot trade with yourself!', 
                    ephemeral: true 
                });
            }

            if (targetUser.bot) {
                return await interaction.reply({ 
                    content: '❌ You cannot trade with bots!', 
                    ephemeral: true 
                });
            }

            // Verificar que ambas cartas existen y pertenecen a los usuarios correctos
            const offerCard = await getCardInfo(initiatorId, offerCardId);
            if (!offerCard) {
                return await interaction.reply({ 
                    content: `❌ You don't own a card with ID: \`${offerCardId.toUpperCase()}\``, 
                    ephemeral: true 
                });
            }

            const requestCard = await getCardInfo(targetUser.id, requestCardId);
            if (!requestCard) {
                return await interaction.reply({ 
                    content: `❌ ${targetUser.displayName} doesn't own a card with ID: \`${requestCardId.toUpperCase()}\``, 
                    ephemeral: true 
                });
            }

            // Verificar si ya hay un trade activo entre estos usuarios
            const tradeKey = [initiatorId, targetUser.id].sort().join('-');
            if (activeTrades.has(tradeKey)) {
                return await interaction.reply({ 
                    content: '❌ There\'s already an active trade between you and this user!', 
                    ephemeral: true 
                });
            }

            // Crear ID único para este trade
            const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            // Guardar trade activo
            activeTrades.set(tradeKey, {
                tradeId,
                initiatorId,
                targetId: targetUser.id,
                offerCard,
                requestCard,
                timestamp: Date.now()
            });

            // Crear embed principal del trade
            const tradeEmbed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('🔄 Trade Proposal')
                .setDescription(`**${interaction.user.displayName}** wants to trade with **${targetUser.displayName}**`)
                .addFields(
                    { 
                        name: '📤 Offering', 
                        value: `${offerCard.name} ${getRarityStars(offerCard.rarity)}\n${offerCard.team} • ${offerCard.position}\n\`${offerCard.card_id}\``, 
                        inline: true 
                    },
                    { 
                        name: '📥 Requesting', 
                        value: `${requestCard.name} ${getRarityStars(requestCard.rarity)}\n${requestCard.team} • ${requestCard.position}\n\`${requestCard.card_id}\``, 
                        inline: true 
                    }
                )
                .setFooter({ text: `Trade expires in 5 minutes • ID: ${tradeId}` })
                .setTimestamp();

            // Crear botones
            const acceptButton = new ButtonBuilder()
                .setCustomId(`trade_accept_${tradeId}`)
                .setLabel('✅ Accept Trade')
                .setStyle(ButtonStyle.Success);

            const rejectButton = new ButtonBuilder()
                .setCustomId(`trade_reject_${tradeId}`)
                .setLabel('❌ Reject Trade')
                .setStyle(ButtonStyle.Danger);

            const detailsButton = new ButtonBuilder()
                .setCustomId(`trade_details_${tradeId}`)
                .setLabel('🔍 View Details')
                .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder()
                .addComponents(acceptButton, rejectButton, detailsButton);

            // Mencionar al usuario objetivo
            const response = await interaction.reply({ 
                content: `${targetUser}, you have a trade proposal!`, 
                embeds: [tradeEmbed], 
                components: [actionRow] 
            });

            // Configurar timeout para el trade (5 minutos)
            setTimeout(() => {
                if (activeTrades.has(tradeKey)) {
                    activeTrades.delete(tradeKey);
                    
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor(0x95A5A6)
                        .setTitle('⏰ Trade Expired')
                        .setDescription('This trade proposal has expired.')
                        .setTimestamp();

                    response.edit({ 
                        content: 'Trade expired.', 
                        embeds: [timeoutEmbed], 
                        components: [] 
                    }).catch(console.error);
                }
            }, 5 * 60 * 1000); // 5 minutos

            // Configurar collector para botones
            const collector = response.createMessageComponentCollector({ 
                time: 5 * 60 * 1000 
            });

            collector.on('collect', async (buttonInteraction) => {
                const tradeData = activeTrades.get(tradeKey);
                if (!tradeData) {
                    return await buttonInteraction.reply({ 
                        content: '❌ This trade is no longer active.', 
                        ephemeral: true 
                    });
                }

                const { initiatorId, targetId, offerCard, requestCard } = tradeData;

                if (buttonInteraction.customId.startsWith('trade_accept_')) {
                    // Solo el usuario objetivo puede aceptar
                    if (buttonInteraction.user.id !== targetId) {
                        return await buttonInteraction.reply({ 
                            content: '❌ Only the trade recipient can accept this trade.', 
                            ephemeral: true 
                        });
                    }

                    try {
                        // Verificar que ambas cartas aún existen
                        const currentOfferCard = await getCardInfo(initiatorId, offerCard.card_id);
                        const currentRequestCard = await getCardInfo(targetId, requestCard.card_id);

                        if (!currentOfferCard || !currentRequestCard) {
                            activeTrades.delete(tradeKey);
                            return await buttonInteraction.reply({ 
                                content: '❌ One of the cards is no longer available. Trade canceled.', 
                                ephemeral: true 
                            });
                        }

                        // Realizar el intercambio en la base de datos
                        await pool.query('BEGIN');
                        
                        await pool.query(
                            'UPDATE user_cards SET user_id = $1 WHERE id = $2',
                            [targetId, offerCard.id]
                        );
                        
                        await pool.query(
                            'UPDATE user_cards SET user_id = $1 WHERE id = $2',
                            [initiatorId, requestCard.id]
                        );
                        
                        await pool.query('COMMIT');

                        // Limpiar trade activo
                        activeTrades.delete(tradeKey);

                        const successEmbed = new EmbedBuilder()
                            .setColor(0x27AE60)
                            .setTitle('✅ Trade Completed!')
                            .setDescription(`**${interaction.user.displayName}** and **${targetUser.displayName}** successfully traded cards!`)
                            .addFields(
                                { 
                                    name: `${targetUser.displayName} received`, 
                                    value: `${offerCard.name} ${getRarityStars(offerCard.rarity)}\n\`${offerCard.card_id}\``, 
                                    inline: true 
                                },
                                { 
                                    name: `${interaction.user.displayName} received`, 
                                    value: `${requestCard.name} ${getRarityStars(requestCard.rarity)}\n\`${requestCard.card_id}\``, 
                                    inline: true 
                                }
                            )
                            .setTimestamp();

                        await buttonInteraction.update({ 
                            content: 'Trade completed successfully!', 
                            embeds: [successEmbed], 
                            components: [] 
                        });

                    } catch (error) {
                        await pool.query('ROLLBACK');
                        console.error('Error executing trade:', error);
                        
                        await buttonInteraction.reply({ 
                            content: '❌ An error occurred while processing the trade. Please try again.', 
                            ephemeral: true 
                        });
                    }

                } else if (buttonInteraction.customId.startsWith('trade_reject_')) {
                    // Solo el usuario objetivo puede rechazar
                    if (buttonInteraction.user.id !== targetId) {
                        return await buttonInteraction.reply({ 
                            content: '❌ Only the trade recipient can reject this trade.', 
                            ephemeral: true 
                        });
                    }

                    activeTrades.delete(tradeKey);

                    const rejectEmbed = new EmbedBuilder()
                        .setColor(0xE74C3C)
                        .setTitle('❌ Trade Rejected')
                        .setDescription(`**${targetUser.displayName}** rejected the trade proposal.`)
                        .setTimestamp();

                    await buttonInteraction.update({ 
                        content: 'Trade rejected.', 
                        embeds: [rejectEmbed], 
                        components: [] 
                    });

                } else if (buttonInteraction.customId.startsWith('trade_details_')) {
                    // Mostrar detalles de ambas cartas
                    const offerEmbed = createCardEmbed(offerCard, '📤 Offering');
                    const requestEmbed = createCardEmbed(requestCard, '📥 Requesting');

                    await buttonInteraction.reply({ 
                        embeds: [offerEmbed, requestEmbed], 
                        ephemeral: true 
                    });
                }
            });

            collector.on('end', () => {
                if (activeTrades.has(tradeKey)) {
                    activeTrades.delete(tradeKey);
                }
            });

        } catch (error) {
            console.error('Error in trade command:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the trade. Please try again.')
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