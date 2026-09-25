const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');

process.on('uncaughtException', (err) => { console.error('⚠️ Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('⚠️ Unhandled Rejection:', reason); });

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
const COOKIE = process.env.ROBLOX_COOKIE;
const TARGET_USERNAME = 'mfrr07786'; 
let targetUserId = null;

const commands = [
    new SlashCommandBuilder()
        .setName('join')
        .setDescription('معرفة حالة صديقك ورابط الانخراط بالماب مع السكن!')
].map(command => command.toJSON());

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing!');
            return;
        }

        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully!`);

        targetUserId = await noblox.getIdFromUsername(TARGET_USERNAME);
        console.log(`[ROBLOX] Tracking user ID: ${targetUserId}`);

        const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);
        
        // جلب أول سيرفر للبوت وتسجيل الأمر فيه حصرياً حتى يظهر فوراً
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commands },
            );
            console.log(`[DISCORD] Slash commands registered instantly for guild: ${guildId}`);
        }

    } catch (err) {
        console.error('Error during startup:', err);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'join') {
        await interaction.deferReply();

        try {
            if (!targetUserId) {
                return interaction.editReply('❌ لم يتم العثور على اللاعب الأساسي أو أن البوت لم يسجل دخول بعد.');
            }

            const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
            const avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';

            const userPresence = await axios.post(`https://presence.roblox.com/v1/presence/users`, {
                userIds: [targetUserId]
            });

            const presenceData = userPresence.data.presence[0];
            const presenceType = presenceData.userPresenceType; 

            if (presenceType !== 2) {
                const statusInfo = getStatusDetails(presenceType);
                
                const embedOffline = new EmbedBuilder()
                    .setColor(statusInfo.color)
                    .setTitle(`🎮 حالة اللاعب: ${TARGET_USERNAME}`)
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: '📍 الحالة الحالية', value: `\`${statusInfo.text}\``, inline: false },
                        { name: '⚠️ تنبيه', value: 'هذا اللاعب غير موجود في أي ماب حالياً.', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Server Joiner Bot' });

                return interaction.editReply({ embeds: [embedOffline] });
            }

            const gameId = presenceData.gameId; 
            const placeId = presenceData.placeId; 
            const universeId = presenceData.universeId;

            const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            const gameName = gameDetails.data.data[0]?.name || 'Unknown Game';

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`🎮 حالة اللاعب: ${TARGET_USERNAME}`)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '📍 الماب الحالي', value: `\`${gameName}\``, inline: false },
                    { name: '🟢 الحالة', value: 'داخل اللعبة يلعب الان', inline: true },
                    { name: '🆔 Job ID', value: `\`${gameId}\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Server Joiner Bot' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Join Game')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`)
                );

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ حدث خطأ أثناء جلب بيانات السيرفر.');
        }
    }
});

function getStatusDetails(type) {
    switch (type) {
        case 0: return { text: '🔴 غير متصل (Offline)', color: 0xFF0000 };
        case 1: return { text: '🟡 متصل / صافن بالقائمة الرئيسية (Online)', color: 0xFFA500 };
        case 3: return { text: '🔵 داخل استوديو روبلوكس (Studio)', color: 0x0000FF };
        default: return { text: '⚪ غير معروف (Unknown)', color: 0x808080 };
    }
}

if (!DISCORD_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing!');
} else {
    client.login(DISCORD_BOT_TOKEN);
}
