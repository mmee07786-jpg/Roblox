const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');

process.on('uncaughtException', (err) => { console.error('⚠️ Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('⚠️ Unhandled Rejection:', reason); });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ]
});

const COOKIE = process.env.ROBLOX_COOKIE;

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing in Environment Variables!');
            return;
        }

        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully as bot account!`);
        console.log(`[DISCORD] Bot is ready and listening to messages as ${client.user.tag}`);
    } catch (err) {
        console.error('Error during startup:', err);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();

    if (command === '!roblox') {
        const targetUsername = args[1];

        if (!targetUsername) {
            return message.reply('❌ يرجى كتابة يوزر اللاعب بعد الأمر!\nمثال: `!roblox mfrr07786`');
        }

        const sentMessage = await message.reply(`🔍 جاري البحث عن اللاعب **${targetUsername}** في روبلوكس...`);

        try {
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ لم يتم العثور على اللاعب **${targetUsername}** في روبلوكس، تأكد من صحة اليوزر!`);
            }

            const userInfo = await noblox.getPlayerInfo(targetUserId);
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
            const avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';

            const userPresence = await axios.post(`https://presence.roblox.com/v1/presence/users`, {
                userIds: [targetUserId]
            });

            const presenceData = userPresence.data.presence[0];
            const presenceType = presenceData.userPresenceType; 

            // إذا الشخص مو متصل أو مو داخل لعبة
            if (presenceType !== 2) {
                const embedOffline = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🎮 معلومات اللاعب: ${displayName}`)
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: '👤 اسم الحساب (Username)', value: `\`${username}\``, inline: true },
                        { name: '🏷️ اسم العرض (Display Name)', value: `\`${displayName}\``, inline: true },
                        { name: '📍 الحالة', value: 'غير متصل ❌', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Status Bot' });

                return sentMessage.edit({ content: '', embeds: [embedOffline] });
            }

            // إذا كان متصل وداخل الماب
            const gameId = presenceData.gameId; 
            const placeId = presenceData.placeId; 
            const universeId = presenceData.universeId;

            const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            const gameName = gameDetails.data.data[0]?.name || 'Unknown Game';

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`🎮 معلومات اللاعب: ${displayName}`)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '👤 اسم الحساب (Username)', value: `\`${username}\``, inline: true },
                    { name: '🏷️ اسم العرض (Display Name)', value: `\`${displayName}\``, inline: true },
                    { name: '📍 الحالة', value: 'متصل ✅', inline: false },
                    { name: '🗺️ الماب الحالي', value: `\`${gameName}\``, inline: false },
                    { name: '🆔 Job ID', value: `\`${gameId}\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Status Bot' });

            // زر Join بنفس طراز زر الرايدات المباشر للسيرفر
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Join Game Server')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`)
                );

            await sentMessage.edit({ content: '', embeds: [embed], components: [row] });

        } catch (error) {
            console.error(error);
            await sentMessage.edit('❌ حدث خطأ أثناء جلب بيانات السيرفر أو اللاعب.');
        }
    }
});

const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DISCORD_BOT_TOKEN);
}
