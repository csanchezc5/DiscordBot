process.removeAllListeners('warning');
require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
    ],
});

// Evento cuando el bot se conecta (CORREGIDO)
client.on('ready', (c) => {
    console.log(`✨ ${c.user.username} is online`);
});

// Manejo de mensajes normales
client.on('messageCreate', (msg) => {
    if (msg.author.bot) {
        return;
    }

    if (msg.content === 'Hola') {
        msg.reply('¡Hola! 👋');
    }
});

// Manejo de comandos slash (MEJORADO)
client.on('interactionCreate', async (interaction) => { 
    if (!interaction.isChatInputCommand()) return;
    
    console.log(`Comando recibido: ${interaction.commandName}`);
    
    if (interaction.commandName === 'add') {
        const num1= interaction.options.get('primer_numero').value;
        const num2= interaction.options.get('segundo_numero').value;

        interaction.reply(`La suma es: ${num1 + num2}`);

        }
});

client.login(process.env.TOKEN);