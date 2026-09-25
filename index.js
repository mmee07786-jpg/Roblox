const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const noblox = require('noblox.js');
const axios = require('axios');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// معلومات البوت وحساب روبلوكس الوهمي
const DISCORD_BOT_TOKEN = 'TOKEN_BOT_DYAL_DISCORD_HENA'; // حط توكن بوت الديسكورد هنا
const COOKIE = 'PUT_YOUR_ROBLOSECURITY_COOKIE_HERE'; // حط الكوكي الطويلة اللي نسختها هنا

const TARGET_USERNAME = 'اسم_حسابك_الرئيسي_بروبلوكس'; // اكتب يوزر حسابك الأساسي اللي تريد تراقبه
let targetUserId = null;

client.once('ready', async () => {
    try {
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

            // فحص حالة اللاعب الحالية وهل هو داخل لعبة
            const presence = await noblox.getPlayerInfo(targetUserId);
            const userPresence = await axios.get(`https://presence.roblox.com/v1/presence/users`, {
                data: { userIds: [targetUserId] }
            });

            const presenceData = userPresence.data.presence[0];
            
            // التحقق إذا كان اللاعب يلعب لعبة حالياً (UserPresenceType == 2 يعني في لعبة)
            if (presenceData.userPresenceType !== 2) {
                return interaction.editReply(`⚠️ اللاعب **${TARGET_USERNAME}** ليس داخل أي لعبة حالياً! (الحالة: ${getStatusText(presenceData.userPresenceType)})`);
            }

            const gameId = presenceData.gameId; // آيدي السيرفر (Job ID)
            const placeId = presenceData.placeId; // آيدي الماب
            const universeId = presenceData.universeId;

            // جلب اسم الماب
            const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
            const gameName = gameDetails.data.data[0]?.name || 'Unknown Game';

            // جلب صورة السكن (Avatar Headshot)
            const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
            const avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';

            // تصميم Embed احترافي يعرض الحالة، الماب، والسكن
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

            // إنشاء زر Join التفاعلي
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Join Game')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`) // رابط يفتح اللعبة دايركت على السيرفر
                );

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('❌ حدث خطأ أثناء جلب بيانات السيرفر.');
        }
    }
});

function getStatusText(type) {
    switch (type) {
        case 0: return 'Offline';
        case 1: return 'Online';
        case 2: return 'In Game';
        case 3: return 'In Studio';
        default: return 'Unknown';
    }
}

client.login(DISCORD_BOT_TOKEN);

