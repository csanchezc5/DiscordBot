require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType} = require('discord.js');

const commands = [
    {
        name: 'add',
        description: 'Agrega dos numeros.',
        options: [
            {
                name: 'primer_numero',
                description: 'El primer numero',
                type: ApplicationCommandOptionType.Number,
                required: true,
                choices:[
                    {
                        name:'uno',
                        value: 1,
                    },
                    {
                        name:'dos',
                        value: 2,
                    },
                    {
                        name:'tres',
                        value: 3,
                    },
                ]
            },
            {
                name: 'segundo_numero',
                description: 'El segundo numero',
                type: ApplicationCommandOptionType.Number,
                required: true,
            },
        ]
    },
    {
        name:'embed',
        description:'Envia un embed'
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('Registrando comandos...');
        
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        
        console.log('Comandos registrados exitosamente');
    } catch (error) {
        console.log(`Hay un error: ${error}`);
    }
})();