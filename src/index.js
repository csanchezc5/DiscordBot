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



client.login(process.env.TOKEN);