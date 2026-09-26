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

const COOKIE = process.env.ROBLOSECURITY || process.env.ROBLOX_COOKIE;

const randomAudioTracks = [
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
];

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOSECURITY Cookie is missing!');
            return;
        }
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully! (Direct Join Tracker Active)`);
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
            return message.reply('❌ الاستخدام الصحيح:\n`!m اليوزر`\nمثال: `!m HcahfigMcihal` أو `!m DOOD_07786`');
        }

        const sentMessage = await message.reply(`⚡ **[جاري الرصد المباشر]** يتم فحص اليوزر **${targetUsername}** واستخراج رابط السيرفر...`);

        try {
            let targetUserId = null;
            let username = targetUsername;
            let displayName = targetUsername;

            // 1. الطبقة الأولى: البحث الشامل بالـ Users Search (للبريمو والعشوائي)
            try {
                const searchRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(targetUsername)}&limit=30`, { timeout: 4000 });
                const users = searchRes.data.data || [];
                
                const exactMatch = users.find(u => u.name.toLowerCase() === targetUsername.toLowerCase() || (u.displayName && u.displayName.toLowerCase() === targetUsername.toLowerCase()));
                
                if (exactMatch) {
                    targetUserId = exactMatch.id;
                    username = exactMatch.name;
                    displayName = exactMatch.displayName || exactMatch.name;
                } else if (users.length > 0) {
                    const closeMatch = users.find(u => u.name.toLowerCase().startsWith(targetUsername.toLowerCase()));
                    if (closeMatch) {
                        targetUserId = closeMatch.id;
                        username = closeMatch.name;
                        displayName = closeMatch.displayName || closeMatch.name;
                    } else {
                        targetUserId = users[0].id;
                        username = users[0].name;
                        displayName = users[0].displayName || users[0].name;
                    }
                }
            } catch (e) {}

            // 2. الطبقة الثانية: الـ POST Request
            if (!targetUserId) {
                try {
                    const userLookup = await axios.post(`https://users.roblox.com/v1/usernames/users`, {
                        usernames: [targetUsername],
                        excludeBannedUsers: false
                    }, { timeout: 4000 });

                    if (userLookup.data.data && userLookup.data.data.length > 0) {
                        targetUserId = userLookup.data.data[0].id;
                        username = userLookup.data.data[0].name || targetUsername;
                        displayName = userLookup.data.data[0].displayName || username;
                    }
                } catch (e) {}
            }

            // 3. الطبقة الثالثة: noblox
            if (!targetUserId) {
                try {
                    targetUserId = await noblox.getIdFromUsername(targetUsername);
                } catch (e) {}
            }

            if (!targetUserId) {
                return sentMessage.edit(`❌ عذراً، لم يتم العثور نهائياً على الحساب **"${targetUsername}"** في روبلوكس!`);
            }

            try {
                const basicInfoRes = await axios.get(`https://users.roblox.com/v1/users/${targetUserId}`, { timeout: 3000 });
                if (basicInfoRes.data) {
                    username = basicInfoRes.data.name || username;
                    displayName = basicInfoRes.data.displayName || displayName;
                }
            } catch (e) {}

            // 4. فحص الحالة واستخراج بيانات السيرفر الحقيقي (JobId)
            let presenceStatus = 'غير متصل أو الحساب مخفي ❌';
            let gameName = 'غير مرئي (بسبب إعدادات الخصوصية)';
            let placeId = null;
            let universeId = null;
            let gameId = null; // الـ JobId الخاص بالسيرفر
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
                        gameId = presenceData.gameId; // هذا هو الـ JobId للسيرفر الحالي اللي اللاعب بداخلة

                        if (universeId) {
                            try {
                                const gameInfoRes = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`, { timeout: 2000 });
                                if (gameInfoRes.data.data && gameInfoRes.data.data.length > 0) {
                                    gameName = gameInfoRes.data.data[0].name;
                                    placeId = gameInfoRes.data.data[0].rootPlaceId;
                                }
                            } catch (e) {}
                        }
                    } else if (presenceData.userPresenceType === 3) {
                        presenceStatus = '💻 متصل في استوديو روبلوكس (Studio)';
                        embedColor = 0xFFA500;
                    }
                }
            } catch (e) {}

            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;
            const selectedSong = randomAudioTracks[Math.floor(Math.random() * randomAudioTracks.length)];

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 رادار اللاعب: ${displayName}`)
                .setImage(avatarUrl)
                .addFields(
                    { name: '👤 معلومات الحساب', value: `\`${displayName}\` (@${username})`, inline: false },
                    { name: '📍 حالة الاتصال', value: `**${presenceStatus}**`, inline: false },
                    { name: '🗺️ اسم الماب الحالي', value: `\`${gameName}\``, inline: false },
                    { name: '🔗 رابط الدخول', value: isinGame && placeId && gameId ? '✅ **رابط السيرفر جاهز، اضغط Join أدناه!**' : '⚠️ الماب مخفي أو الحساب لا يسمح بالانضمام، استخدم زر البحث اليدوي 🔍', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Roblox Direct Join Tracker' });

            const row = new ActionRowBuilder();

            // إذا كان داخل ماب وعنده GameId (JobId) حقيقي، نحط زر Join مباشر للسيرفر
            if (isinGame && placeId && gameId && gameName !== 'غير مرئي (بسبب إعدادات الخصوصية)') {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel('🚀 Join (دخول السيرفر)')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`),
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي بماب آخر')
                        .setStyle(ButtonStyle.Secondary)
                );
            } else if (isinGame && placeId) {
                // إذا متصل بس ماب بدون JobId مباشر
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel('🎮 Join (فتح الماب)')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}`),
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي بماب آخر')
                        .setStyle(ButtonStyle.Secondary)
                );
            } else {
                // إذا مو داخل ماب، نحط زر بحث يدوي
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي بالماب (مثل Evade)')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            await sentMessage.edit({ content: `🎵 **معزوفة مختارة:**\n${selectedSong}`, embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Fatal Direct Join Error:', error);
            await sentMessage.edit(`❌ عذراً فهد، حدث خطأ أثناء جلب بيانات هذا الحساب.`);
        }
    }
});

// نافذة الـ Modal للبحث اليدوي
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

// تنفيذ الفحص والتمشيط العميق للسيرفرات وإعطاء زر Join مباشر
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId.startsWith('modal_search_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const mapQuery = interaction.fields.getTextInputValue('map_name_input');

        await interaction.reply({ content: `⚡ **[جاري تمشيط السيرفرات]** يتم فحص سيرفرات ماب **"${mapQuery}"** لإيجاد السيرفر ودك Join عليه...`, ephemeral: true });

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
                } catch (e) {
                    break;
                }
            }

            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;
            let username = 'TargetUser';
            let displayName = 'TargetUser';
            try {
                const basicInfoRes = await axios.get(`https://users.roblox.com/v1/users/${targetUserId}`, { timeout: 2000 });
                if (basicInfoRes.data) {
                    username = basicInfoRes.data.name;
                    displayName = basicInfoRes.data.displayName;
                }
            } catch (e) {}

            if (foundServer) {
                const embedFound = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم رصد اللاعب داخل السيرفر بنجاح!`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '📍 الحالة', value: '🟢 **متصل داخل السيرفر الآن وجاهز للانضمام!**', inline: false },
                        { name: '🗺️ الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 نتيجة الفحص', value: `تم فحصه عبر \`${scannedServersCount}\` سيرفر وإيجاده بنجاح 🚀`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('🚀 Join (الدخول إلى سيرفر اللاعب مباشرة)')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await interaction.editReply({ content: `✅ **تم إيجاد السيرفر! اضغط Join للدخول فوراً:**`, embeds: [embedFound], components: [rowButton] });
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

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('🎮 فتح الماب بشكل عام')
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
