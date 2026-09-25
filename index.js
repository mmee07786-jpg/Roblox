const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');

// نظام حماية البوت ومنعه من التوقف النهائي (Auto-recovery on errors)
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// قراءة التوكن والكوكي من متغيرات النظام (Environment Variables) في Railway
const DISCORD_BOT_TOKEN = process.env.DISCORD_TOKEN;
const COOKIE = process.env.ROBLOX_COOKIE;

const TARGET_USERNAME = 'mfrr07786'; // يوزر حسابك الأساسي المراد مراقبته
let targetUserId = null;

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing in Environment Variables!');
            return;
        }

        // تسجيل الدخول بحساب البوت الوهمي في روبلوكس عبر الكوكي
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully as alt account!`);

        // جلب الآيدي (User ID) لحسابك الأساسي
        targetUserId = await noblox.getIdFromUsername(TARGET_USERNAME);
        console.log(`[DISCORD] Bot is online and tracking user: ${TARGET_USERNAME} (ID:${targetUserId})`);
    } catch (err) {
        console.error('Failed to login to Roblox with cookie:', err);
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

            // جلب صورة السكن (Avatar Headshot) دائماً لعرضها بالـ Embed
            const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
            const avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';

            // فحص حالة اللاعب من بريزنس روبلوكس
            const userPresence = await axios.post(`https://presence.roblox.com/v1/presence/users`, {
                userIds: [targetUserId]
            });

            const presenceData = userPresence.data.presence[0];
            const presenceType = presenceData.userPresenceType; 
            // 0: Offline (غير متصل)
            // 1: Online (متصل / صافن بالقائمة الرئيسية)
            // 2: In Game (داخل ماب)
            // 3: In Studio (في الاستوديو)

            // إذا اللاعب مو داخل لعبة (يعني صافن أو غير متصل)
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

            // إذا كان داخل لعبة، نجيب بيانات السيرفر والماب
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

// دالة لتحديد نص الحالة واللون المناسب إذا لم يكن في اللعبة
function getStatusDetails(type) {
    switch (type) {
        case 0: 
            return { text: '🔴 غير متصل (Offline)', color: 0xFF0000 };
        case 1: 
            return { text: '🟡 متصل / صافن بالقائمة الرئيسية (Online)', color: 0xFFA500 };
        case 3: 
            return { text: '🔵 داخل استوديو روبلوكس (Studio)', color: 0x0000FF };
        default: 
            return { text: '⚪ غير معروف (Unknown)', color: 0x808080 };
    }
}

if (!DISCORD_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DISCORD_BOT_TOKEN);
}
