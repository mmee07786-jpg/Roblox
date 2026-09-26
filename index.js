const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

// قائمة الأغاني العشوائية الفردية
const randomAudioTracks = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
];

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing in Environment Variables!');
            return;
        }
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully! (Advanced Modal & Deep Search Mode Active)`);
        console.log(`[DISCORD] Bot is ready as ${client.user.tag}`);
    } catch (err) {
        console.error('Error during startup:', err);
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.trim().split(/ +/);
    const command = args[0].toLowerCase();

    if (command === '!m') {
        const targetUsername = args[1];

        if (!targetUsername) {
            return message.reply('❌ الاستخدام الصحيح:\n`!m اليوزر`\nمثال: `!m IIIIIIIIII24`');
        }

        const sentMessage = await message.reply(`⚡ **[البحث الشامل]** جاري تحليل الحساب وفحص نشاط اللاعب **${targetUsername}** في روبلوكس...`);

        try {
            // 1. جلب الـ User ID للهدف
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، اللاعب **${targetUsername}** غير موجود في روبلوكس!`);
            }

            // 2. جلب صورة سكن اللاعب ومعلوماته
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(targetUserId).catch(() => ({ username: targetUsername, displayName: targetUsername }));
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // 3. فحص حالة الحضور العامة عبر بروفایل روبلوكس (Presence API)
            let presenceGameName = null;
            let presencePlaceId = null;
            let isOnline = false;
            let hasPrivacyRestriction = false;

            try {
                const presenceRes = await axios.post('https://presence.roblox.com/v1/presence/users', {
                    userIds: [targetUserId]
                }, {
                    headers: { Cookie: `.ROBLOSECURITY=${COOKIE}` }
                });

                const presence = presenceRes.data.userPresences?.[0];
                if (presence) {
                    if (presence.userPresenceType === 1 || presence.userPresenceType === 2 || presence.userPresenceType === 3) {
                        isOnline = true;
                        presencePlaceId = presence.placeId;
                        presenceGameName = presence.lastLocation;
                    } else if (presence.userPresenceType === 0) {
                        isOnline = false;
                    }
                }
            } catch (e) {
                hasPrivacyRestriction = true;
            }

            // اختيار أغنية عشوائية واحدة فقط لهذا البحث
            const selectedSong = randomAudioTracks[Math.floor(Math.random() * randomAudioTracks.length)];

            // صياغة الإمبد الأولي
            const embed = new EmbedBuilder()
                .setColor(isOnline ? 0x00FF00 : 0xFF0000)
                .setTitle(`🎯 نتيجة رصد اللاعب: ${displayName}`)
                .setImage(avatarUrl)
                .addFields(
                    { name: '👤 معلومات الحساب', value: `\`${displayName}\` (@${username})`, inline: false },
                    { name: '📍 حالة الاتصال', value: isOnline ? '🟢 **متصل حالياً!**' : '❌ **غير متصل أو الحساب مخفي (أو مسوي تقييد خصوصية)**', inline: false },
                    { name: '🗺️ الماب الحالي', value: presenceGameName ? `**${presenceGameName}**` : '⚠️ *غير مرئي (بسبب إعدادات الخصوصية أو التقييد)*', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Deep Tracker Bot' });

            // زر يفتح Modal يخلي المستخدم يكتب الماب المتوقع
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 حدد الماب المتوقع (بحث يدوي عميق)')
                        .setStyle(ButtonStyle.Primary)
                );

            await sentMessage.edit({ content: `🎵 **معزوفة مختارة:**\n${selectedSong}`, embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Tracker Error:', error);
            await sentMessage.edit('❌ حدث خطأ تقني أثناء الفحص، يرجى المحاولة لاحقاً.');
        }
    }
});

// التعامل مع الضغط على الزر وفتح نافذة إدخال اسم الماب (Modal)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('guess_map_')) {
        const targetUserId = interaction.customId.split('_')[2];

        const modal = new ModalBuilder()
            .setCustomId(`modal_search_${targetUserId}`)
            .setTitle('بحث عميق عن اللاعب بالماب المتوقع');

        const mapInput = new TextInputBuilder()
            .setCustomId('map_name_input')
            .setLabel('اكتب اسم الماب المتوقع (مثل: TSB, Blox Fruits)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('اكتب اسم الماب هنا...')
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(mapInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    }
});

// استقبال البيانات من نافذة الـ Modal وتنفيذ الفحص العميق والموسع
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId.startsWith('modal_search_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const mapQuery = interaction.fields.getTextInputValue('map_name_input');

        await interaction.reply({ content: `⚡ **[جاري الفحص الموسع]** يتم تمشيط سيرفرات ماب **"${mapQuery}"** بالكامل للبحث عن اللاعب...`, ephemeral: true });

        try {
            // البحث عن الماب المدخل
            let placeId = null;
            let universeId = null;
            let gameName = mapQuery;

            const searchRes = await axios.get(`https://games.roblox.com/v1/games/list?keyword=${encodeURIComponent(mapQuery)}&maxRows=20`);
            const games = searchRes.data.data || [];

            if (games.length > 0) {
                const validGames = games.filter(g => g.name && !g.name.toLowerCase().includes("'s place"));
                validGames.sort((a, b) => (b.playing || 0) - (a.playing || 0));

                const bestMatch = validGames.length > 0 ? validGames[0] : games[0];
                universeId = bestMatch.id;
                placeId = bestMatch.rootPlaceId;
                gameName = bestMatch.name;
            }

            if (!placeId) {
                return interaction.editReply(`❌ لم يتم العثور على ماب بهذا الاسم: **"${mapQuery}"**.`);
            }

            // فحص سيرفرات الماب بعمق (أخذ الوقت الكافي بالبحث)
            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 35; // زيادة عدد المحاولات لكي يأخذ البوت راحته بالبحث

            while (attempts < maxAttempts) {
                attempts++;
                try {
                    const serversUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
                    const serversRes = await axios.get(serversUrl);
                    const servers = serversRes.data.data || [];

                    if (servers.length === 0) break;

                    for (const server of servers) {
                        scannedServersCount++;
                        if (server.playerIds && server.playerIds.includes(targetUserId)) {
                            foundServer = server;
                            break;
                        }
                    }

                    if (foundServer) break;

                    cursor = serversRes.data.nextPageCursor;
                    if (!cursor) break;

                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (err) {
                    break;
                }
            }

            // جلب معلومات اللاعب وصورته
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(Number(targetUserId)).catch(() => ({ username: 'TargetUser', displayName: 'TargetUser' }));
            const username = userInfo.username;
            const displayName = userInfo.displayName;

            // نتيجة البحث اليدوي العميق
            if (foundServer) {
                const embedFound = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم العثور على اللاعب في الماب المتوقع!`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب المستهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '📍 حالة الاتصال', value: '🟢 **متصل داخل هذا الماب وتأكدنا من وجوده!**', inline: false },
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الفحص', value: `تم فحص \`${scannedServersCount}\` سيرفر حتى تم العثور عليه 🚀`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(`الـبحث عن الاعب ب ${gameName}`.substring(0, 80))
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await interaction.editReply({ content: `✅ **تمت العملية بنجاح!**`, embeds: [embedFound], components: [rowButton] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🛡️ نتيجة البحث في ماب (${gameName})`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب المستهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '📍 حالة الاتصال', value: '❌ **غير موجود في سيرفرات هذا الماب العامة حالياً**', inline: false },
                        { name: '🗺️ الماب المفحوص', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الفحص', value: `تم فحص \`${scannedServersCount}\` سيرفر بالكامل دون العثور عليه (قد يكون في سيرفر خاص أو ماب آخر).`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(`الـبحث عن الاعب ب ${gameName}`.substring(0, 80))
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}`)
                    );

                await interaction.editReply({ content: `⚠️ **انتهى الفحص الموسع.**`, embeds: [embedNotFound], components: [rowButton] });
            }

        } catch (error) {
            console.error('Modal Search Error:', error);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء تنفيذ البحث العميق، يرجى المحاولة مرة أخرى.' });
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
