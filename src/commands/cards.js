const { EmbedBuilder } = require('discord.js');
const pool = require('../database.js');

module.exports = {
    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            // Obtener todas las cartas del usuario con información del jugador
            const userCards = await pool.query(`
                SELECT p.name, p.team, p.position, p.nationality, p.rarity, p.image_url,
                       uc.collected_at,
                       COUNT(*) as quantity
                FROM user_cards uc
                JOIN players p ON uc.player_id = p.id
                WHERE uc.user_id = $1
                GROUP BY p.id, p.name, p.team, p.position, p.nationality, p.rarity, p.image_url, uc.collected_at
                ORDER BY uc.collected_at DESC
            `, [userId]);

            if (userCards.rows.length === 0) {
                const noCardsEmbed = new EmbedBuilder()
                    .setColor(0x95A5A6)
                    .setTitle('📦 Empty Collection')
                    .setDescription('You don\'t have any cards yet! Use `/drop` to collect your first card.')
                    .setFooter({ text: 'Start collecting now!' });

                return await interaction.reply({ embeds: [noCardsEmbed] });
            }

            // Contar raridades
            const rarityCount = {
                'Epic': userCards.rows.filter(card => card.rarity === 'Epic').length,
                'Rare': userCards.rows.filter(card => card.rarity === 'Rare').length,
                'Common': userCards.rows.filter(card => card.rarity === 'Common').length
            };

            const totalCards = userCards.rows.length;

            // Crear embed principal
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle(`⚽ ${interaction.user.displayName}'s Collection`)
                .setDescription(`**Total Cards: ${totalCards}**\n\n🟣 Epic: ${rarityCount.Epic}\n🔵 Rare: ${rarityCount.Rare}\n⚪ Common: ${rarityCount.Common}`)
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp();

            // Agregar las primeras 10 cartas como fields
            const cardsToShow = userCards.rows.slice(0, 10);
            cardsToShow.forEach((card, index) => {
                const rarityEmoji = card.rarity === 'Epic' ? '🟣' : card.rarity === 'Rare' ? '🔵' : '⚪';
                embed.addFields({
                    name: `${rarityEmoji} ${card.name}`,
                    value: `${card.team} • ${card.position}`,
                    inline: true
                });
            });

            if (userCards.rows.length > 10) {
                embed.setFooter({ 
                    text: `Showing 10 of ${totalCards} cards • Collected by ${interaction.user.displayName}`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            } else {
                embed.setFooter({ 
                    text: `Collected by ${interaction.user.displayName}`,
                    iconURL: interaction.user.displayAvatarURL()
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error en collection:', error);
            await interaction.reply('Error al mostrar la colección.');
        }
    }
};