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

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOSECURITY Cookie is missing!');
            return;
        }
        await noblox.setCookie(COOKIE);
        const botUser = await noblox.getCurrentUser();
        console.log(`[ROBLOX] Logged in successfully as: ${botUser.UserName}`);
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

        const sentMessage = await message.reply(`🔍 **[جاري الفحص الشامل]** البوت يبحث عن اللاعب **${targetUsername}** ويسحب بياناته الحقيقية...`);

        try {
            let targetUserId = null;
            let username = targetUsername;
            let displayName = targetUsername;

            // 1. البحث الشامل والذكي عن اليوزر (مهما كانت حالته أو حروفه)
            try {
                const searchRes = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(targetUsername)}&limit=30`, { timeout: 4000 });
                const users = searchRes.data.data || [];
                const exactMatch = users.find(u => u.name.toLowerCase() === targetUsername.toLowerCase() || (u.displayName && u.displayName.toLowerCase() === targetUsername.toLowerCase()));
                
                if (exactMatch) {
                    targetUserId = exactMatch.id;
                    username = exactMatch.name;
                    displayName = exactMatch.displayName || exactMatch.name;
                } else if (users.length > 0) {
                    targetUserId = users[0].id;
                    username = users[0].name;
                    displayName = users[0].displayName || users[0].name;
                }
            } catch (e) {}

            if (!targetUserId) {
                try {
                    const userLookup = await axios.post(`https://users.roblox.com/v1/usernames/users`, {
                        usernames: [targetUsername],
                        excludeBannedUsers: false
                    }, { timeout: 4000 });

                    if (userLookup.data.data && userLookup.data.data.length > 0) {
                        targetUserId = userLookup.data.data[0].id;
                        username = userLookup.data.data[0].name;
                        displayName = userLookup.data.data[0].displayName;
                    }
                } catch (e) {}
            }

            if (!targetUserId) {
                return sentMessage.edit(`❌ عذراً، لم يتم العثور على الحساب **"${targetUsername}"** في روبلوكس!`);
            }

            // سحب معلومات البروفايل الحقيقية
            let accountCreated = 'غير معروف';
            let profileBio = 'لا يوجد وصف';
            let followersCount = '0';

            try {
                const userInfoRes = await axios.get(`https://users.roblox.com/v1/users/${targetUserId}`);
                if (userInfoRes.data) {
                    accountCreated = new Date(userInfoRes.data.created).toLocaleDateString('ar-EG');
                    profileBio = userInfoRes.data.description || 'لا يوجد وصف';
                }
                const followersRes = await axios.get(`https://friends.roblox.com/v1/users/${targetUserId}/followers/count`);
                followersCount = followersRes.data.count.toLocaleString();
            } catch (e) {}

            // فحص الحالة المباشرة
            let presenceStatus = 'غير متصل أو الحساب مخفي ❌';
            let gameName = 'غير مرئي';
            let placeId = null;
            let universeId = null;
            let gameId = null;
            let embedColor = 0x546e7a;
            let isinGame = false;

            try {
                const presenceRes = await axios.post('https://presence.roblox.com/v1/presence/users', {
                    userIds: [targetUserId]
                }, {
                    headers: {
                        'Cookie': `.ROBLOSECURITY=${COOKIE}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 4000
                });

                const presenceData = presenceRes.data.userPresences[0];
                if (presenceData) {
                    if (presenceData.userPresenceType === 1) {
                        presenceStatus = '🟢 متصل الآن (الصفحة الرئيسية)';
                        embedColor = 0x00FF00;
                    } else if (presenceData.userPresenceType === 2) {
                        isinGame = true;
                        presenceStatus = '🎮 متصل وداخل ماب (يلعب حالياً)';
                        embedColor = 0x00FF00;
                        
                        universeId = presenceData.universeId;
                        gameId = presenceData.gameId;

                        if (universeId) {
                            try {
                                const gameInfoRes = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
                                if (gameInfoRes.data.data && gameInfoRes.data.data.length > 0) {
                                    gameName = gameInfoRes.data.data[0].name;
                                    placeId = gameInfoRes.data.data[0].rootPlaceId;
                                }
                            } catch (e) {}
                        }
                    }
                }
            } catch (e) {}

            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎯 رادار اللاعب الحقيقي: ${displayName}`)
                .setImage(avatarUrl)
                .addFields(
                    { name: '👤 اليوزر', value: `\`${username}\``, inline: true },
                    { name: '📅 تاريخ الإنشاء', value: `\`${accountCreated}\``, inline: true },
                    { name: '👥 المتابعين', value: `\`${followersCount}\``, inline: true },
                    { name: '📝 البايو', value: `\`\`\`${profileBio.substring(0, 90)}\`\`\``, inline: false },
                    { name: '📍 الحالة الحالية', value: `**${presenceStatus}**`, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: `بحث حقيقي عبر روبلوكس API | UserID: ${targetUserId}` });

            if (isinGame) {
                embed.addFields({ name: '🗺️ اسم الماب', value: `\`${gameName}\``, inline: false });
            }

            const row = new ActionRowBuilder();

            if (isinGame && placeId && gameId) {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel('🚀 Join (الدخول المباشر للسيرفر)')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`roblox://placeId=${placeId}&linkCode=${gameId}`),
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 بحث يدوي متوسع بالسيرفرات')
                        .setStyle(ButtonStyle.Secondary)
                );
            } else {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`guess_map_${targetUserId}`)
                        .setLabel('🔍 ابحث عنه داخل ماب (مثل TSB, Evade)')
                        .setStyle(ButtonStyle.Primary)
                );
            }

            await sentMessage.edit({ content: `✅ **تم فحص الحساب وجلب المعلومات الحقيقية!**`, embeds: [embed], components: [row] });

        } catch (error) {
            console.error('Error:', error);
            await sentMessage.edit(`❌ حدث خطأ أثناء فحص الحساب.`);
        }
    }
});

// فتح نافذة إدخال اسم الماب للبحث اليدوي
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    if (interaction.customId.startsWith('guess_map_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder()
            .setCustomId(`modal_search_${targetUserId}`)
            .setTitle('بحث وتتبع اللاعب في المابات المشهورة');

        const mapInput = new TextInputBuilder()
            .setCustomId('map_name_input')
            .setLabel('اكتب اسم الماب (مثال: TSB, Evade, Blox Fruits)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('اكتب اسم الماب هنا...')
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(mapInput));
        await interaction.showModal(modal);
    }
});

// نظام البحث الطبيعي والعميق والمتوسع في سيرفرات المابات العامة
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId.startsWith('modal_search_')) {
        const targetUserId = interaction.customId.split('_')[2];
        const mapQuery = interaction.fields.getTextInputValue('map_name_input');

        // رسالة توضح أن البوت يأخذ وقتاً حقيقياً وطبيعياً في الفحص
        await interaction.reply({ content: `⏳ **[جاري البحث الحقيقي والعميق]** البوت يقوم الآن بفحص سيرفرات ماب **"${mapQuery}"** صفحة بصفحة (قد يستغرق بضع ثوانٍ)...`, ephemeral: true });

        try {
            let placeId = null;
            let gameName = mapQuery;

            // البحث عن الماب المطلوب بدقة
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
            const maxAttempts = 40; // توسيع نطاق البحث لضمان إيجاد السيرفر الحقيقي

            // حلقة تكرارية تأخذ وقتاً طبيعياً وحقيقياً في الفحص
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

                    // مهلة زمنية قصيرة بين الطلبات لضمان عمل الفحص بشكل طبيعي ومستقر بدون حظر من روبلوكس
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (e) {
                    break;
                }
            }

            let avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${targetUserId}&width=420&height=420&format=png`;

            if (foundServer) {
                const embedFound = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم العثور على اللاعب في الماب بنجاح!`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '📍 الحالة', value: '🟢 **متصل داخل هذا السيرفر العام الآن!**', inline: false },
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 تقرير البحث', value: `تم فحص \`${scannedServersCount}\` سيرفر حقيقي وإيجاده بنجاح 🚀`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('🚀 Join (الدخول إلى سيرفر اللاعب مباشرة)')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await interaction.editReply({ content: `✅ **تم إيجاد السيرفر بنجاح بعد فحص حقيقي! اضغط Join:**`, embeds: [embedFound], components: [rowButton] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🛡️ نتيجة البحث في ماب (${gameName})`)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '📍 الحالة', value: '❌ **غير موجود في السيرفرات العامة**', inline: false },
                        { name: '📊 تقرير البحث', value: `تم فحص \`${scannedServersCount}\` سيرفر ولم يتم العثور عليه (قد يكون في سيرفر خاص VIP أو ماب آخر).`, inline: false }
                    )
                    .setTimestamp();

                const rowButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('🎮 فتح الماب بشكل عام')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}`)
                    );

                await interaction.editReply({ content: `⚠️ **انتهى الفحص الحقيقي.**`, embeds: [embedNotFound], components: [rowButton] });
            }

        } catch (error) {
            console.error('Search Error:', error);
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
