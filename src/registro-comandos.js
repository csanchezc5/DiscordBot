require('dotenv').config();
const { REST, Routes } = require('discord.js');

const commands = [
    {
        name: 'drop',
        description: 'Recolecta una carta de jugador.',
    },
    {
        name: 'collection',
        description: 'Revisa tu colección de cartas en tu inventario'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

module.exports = async (client) => {
    try {
        console.log('Registrando comandos...');
        
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        
        console.log('Comandos registrados exitosamente');

        // Manejar interacciones
        client.on('interactionCreate', async interaction => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;

            if (commandName === 'drop') {
                const collectCommand = require('./commands/collect.js');
                await collectCommand.execute(interaction);
            } else if (commandName === 'collection') {
                const cardsCommand = require('./commands/cards.js');
                await cardsCommand.execute(interaction);
            }
        });

    } catch (error) {
        console.log(`Hay un error: ${error}`);
    }
};