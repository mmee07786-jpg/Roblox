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
            return message.reply('❌ يرجى كتابة اليوزر بعد الأمر مباشرة!\nمثال: `!roblox اسم_الحساب`');
        }

        const sentMessage = await message.reply(`🔍 جاري البحث عن الحساب **${targetUsername}**...`);

        try {
            // البحث المباشر بروبلوكس عبر اليوزر الأساسي
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، لم يتم العثور على اللاعب **${targetUsername}**، تأكد من كتابة يوزر الحساب الصحيح بدقة!`);
            }

            // جلب معلومات الحساب كاملة
            let userInfo;
            try {
                userInfo = await noblox.getPlayerInfo(targetUserId);
            } catch (e) {
                userInfo = { username: targetUsername, displayName: targetUsername };
            }

            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // جلب صورة السكن
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {
                console.log('Error fetching avatar');
            }

            // فحص الحالة (Presence)
            let presenceData = { userPresenceType: 0 };
            try {
                const userPresence = await axios.post(`https://presence.roblox.com/v1/presence/users`, {
                    userIds: [targetUserId]
                });
                presenceData = userPresence.data.presence[0] || presenceData;
            } catch (err) {
                console.log('Error fetching presence');
            }

            const presenceType = presenceData.userPresenceType; 
            // 2 تعني داخل اللعبة

            // إذا اللاعب غير متصل / مو داخل ماب
            if (presenceType !== 2) {
                const embedOffline = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🎮 معلومات الحساب: ${displayName}`)
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: '👤 اليوزر الأساسي', value: `\`${username}\``, inline: true },
                        { name: '🏷️ اسم العرض', value: `\`${displayName}\``, inline: true },
                        { name: '📍 الحالة', value: 'غير متصل ❌', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Status Bot' });

                return sentMessage.edit({ content: '', embeds: [embedOffline] });
            }

            // إذا اللاعب متصل وداخل الماب
            const gameId = presenceData.gameId; 
            const placeId = presenceData.placeId; 
            const universeId = presenceData.universeId;

            let gameName = 'Unknown Game';
            try {
                const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
                gameName = gameDetails.data.data[0]?.name || 'Unknown Game';
            } catch (err) {
                console.log('Error fetching game name');
            }

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`🎮 معلومات الحساب: ${displayName}`)
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: '👤 اليوزر الأساسي', value: `\`${username}\``, inline: true },
                    { name: '🏷️ اسم العرض', value: `\`${displayName}\``, inline: true },
                    { name: '📍 الحالة', value: 'متصل ✅', inline: false },
                    { name: '🗺️ الماب الحالي', value: `\`${gameName}\``, inline: false },
                    { name: '🆔 Job ID', value: `\`${gameId}\``, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Status Bot' });

            // زر الـ Join المباشر لسيرفر الشخص نفسه
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Join Game')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`)
                );

            await sentMessage.edit({ content: '', embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Main Error:', error);
            await sentMessage.edit('❌ حدث خطأ غير متوقع، تأكد من صحة الـ Cookie وتفعيل الصلاحيات.');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
