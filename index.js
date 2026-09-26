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

// استقبال الرسائل والأوامر النصية
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase(); // الأمر الأساسي

    // التحقق من الأمر أن يكون !roblox فقط
    if (command === '!roblox') {
        const targetUsername = args[1]; // اليوزر المكتوب بعد الأمر

        if (!targetUsername) {
            return message.reply('❌ يرجى كتابة يوزر اللاعب بعد الأمر!\nمثال: `!roblox mfrr07786`');
        }

        const sentMessage = await message.reply(`🔍 جاري البحث عن اللاعب **${targetUsername}** في روبلوكس...`);

        try {
            // جلب آيدي اللاعب من اليوزر
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ لم يتم العثور على اللاعب **${targetUsername}** في روبلوكس، تأكد من صحة اليوزر!`);
            }

            // جلب صورة السكن (Avatar Headshot)
            const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
            const avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';

            // فحص حالة اللاعب من روبلوكس بريزنس
            const userPresence = await axios.post(`https://presence.roblox.com/v1/presence/users`, {
                userIds: [targetUserId]
            });

            const presenceData = userPresence.data.presence[0];
            const presenceType = presenceData.userPresenceType; 
            // 0: Offline, 1: Online, 2: In Game, 3: In Studio

            // إذا اللاعب مو داخل لعبة
            if (presenceType !== 2) {
                const statusInfo = getStatusDetails(presenceType);
                
                const embedOffline = new EmbedBuilder()
                    .setColor(statusInfo.color)
                    .setTitle(`🎮 حالة اللاعب: ${targetUsername}`)
                    .setThumbnail(avatarUrl)
                    .addFields(
                        { name: '📍 الحالة الحالية', value: `\`${statusInfo.text}\``, inline: false },
                        { name: '⚠️ تنبيه', value: 'هذا اللاعب غير موجود في أي ماب حالياً.', inline: false }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Server Joiner Bot' });

                return sentMessage.edit({ content: '', embeds: [embedOffline] });
            }

            // إذا كان داخل لعبة، نجيب بيانات الماب والسيرفر
            const gameId = presenceData.gameId; 
            const placeId = presenceData.placeId; 
            const universeId = presenceData.universeId;

            const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            const gameName = gameDetails.data.data[0]?.name || 'Unknown Game';

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`🎮 حالة اللاعب: ${targetUsername}`)
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

            await sentMessage.edit({ content: '', embeds: [embed], components: [row] });

        } catch (error) {
            console.error(error);
            await sentMessage.edit('❌ حدث خطأ أثناء جلب بيانات السيرفر أو اللاعب.');
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

const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DISCORD_BOT_TOKEN);
}
