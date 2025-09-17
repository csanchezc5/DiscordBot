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
    },
    {
        name: 'burn',
        description: 'Elimina una carta de tu colección',
        options: [
            {
                name: 'card_id',
                type: 3, // STRING
                description: 'ID de la carta a eliminar (opcional - si no se especifica, se quema la última carta)',
                required: false
            }
        ]
    },
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

            try {
                if (commandName === 'drop') {
                    const collectCommand = require('./commands/collect.js');
                    await collectCommand.execute(interaction);
                    
                } else if (commandName === 'collection') {
                    const cardsCommand = require('./commands/cards.js');
                    await cardsCommand.execute(interaction);
                                        
                }else if (commandName=== 'burn') {
                    const burnCommand = require('./commands/burn.js');
                    await burnCommand.execute(interaction);
                } else {
                    console.log(`Comando desconocido: ${commandName}`);
                }
                
            } catch (error) {
                console.error(`Error ejecutando comando ${commandName}:`, error);
                
                // Manejo de errores para responder al usuario
                const errorMessage = 'Hubo un error al ejecutar este comando. Por favor, inténtalo de nuevo.';
                
                try {
                    if (interaction.deferred) {
                        await interaction.editReply(errorMessage);
                    } else if (!interaction.replied) {
                        await interaction.reply({ content: errorMessage, ephemeral: true });
                    }
                } catch (replyError) {
                    console.error('Error enviando respuesta de error:', replyError);
                }
            }
        });

    } catch (error) {
        console.log(`Hay un error: ${error}`);
    }
};