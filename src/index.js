process.removeAllListeners('warning');
require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

client.on('ready', (c) => {
    console.log(`✨ ${c.user.username} is online`);

     require('./registro-comandos.js')(client);
});

client.on('messageCreate', (msg) => {
    if (msg.author.bot) {
        return;
    }

    if (msg.content === 'Hola') {
        msg.reply('¡Hola! 👋');
    }
});

client.on('interactionCreate', async (interaction) => { 
    if (!interaction.isChatInputCommand()) return;
    
    console.log(`Comando recibido: ${interaction.commandName}`);
    
    try {
        if (interaction.commandName === 'add') {
            const num1 = interaction.options.get('primer_numero').value;
            const num2 = interaction.options.get('segundo_numero').value;

            await interaction.reply(`La suma es: ${num1 + num2}`);
        }
        
        if (interaction.commandName === 'embed') {
            await interaction.deferReply({ ephemeral: true });
            
            const embed = new EmbedBuilder()
                .setTitle("Embed title")
                .setDescription('Esto es una descripcion del embed')
                .setColor('Random')
                .addFields({ 
                    name: 'Field title', 
                    value: 'Valor random',
                    inline: true
                },
                { 
                    name: '2nd Field title', 
                    value: 'Otro Valor random',
                    inline: false
                });

            await interaction.channel.send({ embeds: [embed] });
            
            await interaction.deleteReply();
        }
    } catch (error) {
        console.error('Error en comando:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply('Hubo un error al ejecutar el comando ❌');
        }
    }
});

client.login(process.env.TOKEN);