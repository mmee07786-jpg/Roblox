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

const randomAudioTracks = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
];

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing!');
            return;
        }
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully! (Universal Random Username Tracker Active)`);
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
            return message.reply('❌ الاستخدام الصحيح:\n`!m اليوزر`\nمثال: `!m Cfyjctjfxtyfyj` أو `!m OblivionFromTsb`');
        }

        const sentMessage = await message.reply(`⚡ **[جاري البحث الشامل]** يتم فحص اليوزر العشوائي **${targetUsername}** بدقة...`);

        try {
            // جلب الـ User ID للأسماء العشوائية والحقيقية عبر الـ API المباشر بدون أخطاء
            let targetUserId = null;
            try {
                const userLookup = await axios.post(`https://users.roblox.com/v1/usernames/users`, {
                    usernames: [targetUsername],
                    excludeBannedUsers: false
                }, { timeout: 4000 });

                if (userLookup.data.data && userLookup.data.data.length > 0) {
                    targetUserId = userLookup.data.data[0].id;
                }
            } catch (errApi) {
                console.error('API Lookup Error:', errApi.message);
            }

            // محاولة احتياطية ثانية إذا فشلت الأولى (البحث بالبحث النصي الحر)
            if (!targetUserId) {
                try {
                    const searchRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(targetUsername)}&limit=10`, { timeout: 4000 });
                    const users = searchRes.data.data || [];
                    const matchedUser = users.find(u => u.name.toLowerCase() === targetUsername.toLowerCase() || (u.displayName && u.displayName.toLowerCase() === targetUsername.toLowerCase()));
                    if (matchedUser) {
                        targetUserId = matchedUser.id;
                    } else if (users.length > 0) {
                        targetUserId = users[0].id; // أول نتيجة تقريبية مطابقة
                    }
                } catch (errSearch) {}
            }

            if (!targetUserId) {
                return sentMessage.edit(`❌ عذراً، لم يتم العثور على أي حساب بهذا الاسم العشوائي: **"${targetUsername}"** في روبلوكس!`);
            }

            // جلب معلومات الحساب
            let username = targetUsername;
            let displayName = targetUsername;
            try {
                const userInfo = await noblox.getPlayerInfo(targetUserId);
                username = userInfo.username || targetUsername;
                displayName = userInfo.displayName || username;
            } catch (e) {}

            // فحص الحالة (Presence)
            let presenceStatus = 'غير متصل أو الحساب مخفي ❌';
            let gameName = 'غير مرئي (بسبب إعدادات الخصوصية)';
            let placeId = null;
            let universeId = null;
            let embedColor = 0xFF0000;
            let isinGame = false;

            try {
                const presenceRes = await axios.post('https://presence.roblox.com/v1/presence/users', {
                    userIds: [targetUserId]
                }, {
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${COOKIE}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 3000
                });

                const presenceData = presenceRes.data.userPresences[0];
                if (presenceData) {
                    if (presenceData.userPresenceType === 1) {
                        presenceStatus = '🟢 متصل (Online في الصفحة الرئيسية)';
                        embedColor = 0x00FF00;
                    } else if (presenceData.userPresenceType === 2) {
                        isinGame = true;
                        presenceStatus = '🎮 متصل وداخل ماب (In-Game)';
                        embedColor = 0x00FF00;
                        
                        universeId = presenceData.universeId;
                        if (universeId) {
                            try {
                                const gameInfoRes = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`, { timeout: 2000 });
                                if (gameInfoRes.data.data && gameInfoRes.data.data.length > 0) {
                                    gameName = gameInfoRes.data.data[0].name;
                                    placeId = gameInfoRes.data.data[0].rootPlaceId;
                                }
                            } catch (errGame) {}
                        }
                    } else if (presenceData.userPresenceType === 3) {
                        presenceStatus = '💻 متصل في استوديو روبلوكس (Studio)';
                        embedColor = 0xFFA500;
                    }
                }
            } catch (errPresence) {}

            // جلب صورة السكن
            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;
            try {
                const headshots = await noblox.getPlayerThumbnail(targetUserId, '420x420', 'png', false, 'headshot');
                if (headshots && headshots[0]?.imageUrl) {
                    avatarUrl = headshots[0].imageUrl;
                }
            } catch (errThumb) {}

            const selectedSong = randomAudioTracks[Math.floor(Math.random() * randomAudioTracks.length)];

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 رادار اللاعب: ${displayName}`)
                .setImage(avatarUrl)
                .addFields(
                    { name: '👤 معلومات الحساب', value: `\`${displayName}\` (@${username})`, inline: false },
                    { name: '📍 حالة الاتصال', value: `**${presenceStatus}**`, inline: false },
                    { name: '🗺️ اسم الماب الحالي', value: `\`${gameName}\``, inline: false },
                    { name: '🔍 أدوات التتبع', value: isinGame && placeId ? '✅ تم رصد الماب وجاهز للربط!' : '⚠️ الماب مخفي أو الحساب صادّه الجوين، استخدم الزر أدناه للبحث اليدوي 🚀', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Universal Tracker Bot' });

            const row = new ActionRowBuilder();

            if (isinGame && placeId && gameName !== 'غير مرئي (بسبب إعدادات الخصوصية)') {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(`🎮 فتح ماب (${gameName.substring(0, 20)})`.substring(0, 80))
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}`),
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي بـ ماب آخر')
                        .setStyle(ButtonStyle.Secondary)
                );
            } else {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي بالماب (مثل Evade)')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            await sentMessage.edit({ content: `🎵 **معزوفة مختارة:**\n${selectedSong}`, embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Fatal Tracker Error:', error);
            await sentMessage.edit('❌ حدث خطأ غير متوقع أثناء معالجة اليوزر العشوائي.');
        }
    }
});

// التعامل مع نافذة الـ Modal للبحث اليدوي
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('guess_map_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder()
            .setCustomId(`modal_search_${targetUserId}`)
            .setTitle('بحث وتتبع اللاعب داخل الماب');

        const mapInput = new TextInputBuilder()
            .setCustomId('map_name_input')
            .setLabel('اكتب اسم الماب (مثل: Evade, TSB)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('اكتب اسم الماب هنا...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(mapInput));
        await interaction.showModal(modal);
    }
});

// تنفيذ الفحص والتمشيط العميق للسيرفرات
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId.startsWith('modal_search_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const mapQuery = interaction.fields.getTextInputValue('map_name_input');

        await interaction.reply({ content: `⚡ **[جاري تمشيط السيرفرات]** يتم فحص سيرفرات ماب **"${mapQuery}"**...`, ephemeral: true });

        try {
            let placeId = null;
            let gameName = mapQuery;

            const searchRes = await axios.get(`https://games.roblox.com/v1/games/list?keyword=${encodeURIComponent(mapQuery)}&maxRows=20`, { timeout: 4000 });
            const games = searchRes.data.data || [];

            if (games.length > 0) {
                const validGames = games.filter(g => g.name && !g.name.toLowerCase().includes("'s place"));
                validGames.sort((a, b) => (b.playing || 0) - (a.playing || 0));
                const bestMatch = validGames.length > 0 ? validGames[0] : games[0];
                placeId = bestMatch.rootPlaceId;
                gameName = bestMatch.name;
            }

            if (!placeId) {
                return interaction.editReply(`❌ لم يتم العثور على ماب بهذا الاسم: **"${mapQuery}"**.`);
            }

            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 30;

            while (attempts < maxAttempts) {
                attempts++;
                try {
                    const serversUrl = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100${cursor ? `&cursor=${cursor}` : ''}`;
                    const serversRes = await axios.get(serversUrl, { timeout: 3000 });
                    const servers = serversRes.data.data || [];

                    if (servers.length === 0) break;

                    for (const server of servers) {
                        scannedServersCount++;
                        if (server.playerIds && server.playerIds.includes(Number(targetUserId))) {
                            foundServer = server;
                            break;
                        }
                    }

                    if (foundServer) break;
                    cursor = serversRes.data.nextPageCursor;
                    if (!cursor) break;

                    await new Promise(resolve => setTimeout(resolve, 150));
                } catch (err) {
                    break;
                }
            }

            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;
            try {
                const headshots = await noblox.getPlayerThumbnail(Number(targetUserId), '420x420', 'png', false, 'headshot');
                if (headshots && headshots[0]?.imageUrl) avatarUrl = headshots[0].imageUrl;
            } catch (e) {}

            let username = 'TargetUser';
            let displayName = 'TargetUser';
            try {
                const userInfo = await noblox.getPlayerInfo(Number(targetUserId));
                username = userInfo.username;
                displayName = userInfo.displayName;
            } catch (e) {}

            if (foundServer) {
                const embedFound = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم رصد اللاعب داخل السيرفر بنجاح!`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '📍 الحالة', value: '🟢 **متصل داخل هذا السيرفر الآن!**', inline: false },
                        { name: '🗺️ الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 نتيجة الفحص', value: `تم فحصه عبر \`${scannedServersCount}\` سيرفر وإيجاده بنجاح 🚀`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('الدخول إلى سيرفر اللاعب')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await interaction.editReply({ content: `✅ **تم إيجاد اللاعب بنجاح!**`, embeds: [embedFound], components: [rowButton] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🛡️ نتيجة البحث في ماب (${gameName})`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '📍 الحالة', value: '❌ **غير موجود في السيرفرات العامة لهذا الماب**', inline: false },
                        { name: '📊 نتيجة الفحص', value: `تم فحص \`${scannedServersCount}\` سيرفر بالكامل ولم يُعثر عليه.`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowButton()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('فتح الماب')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}`)
                    );

                await interaction.editReply({ content: `⚠️ **انتهى الفحص.**`, embeds: [embedNotFound], components: [rowButton] });
            }

        } catch (error) {
            console.error('Modal Search Error:', error);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء تنفيذ البحث العميق، يرجى المحاولة مرة أخرى.' });
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing!');
} else {
    client.login(DIS_BOT_TOKEN);
}
