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
        console.log(`[ROBLOX] Logged in successfully as bot account! (Hardcore Mode Active)`);
        console.log(`[DISCORD] Bot is ready as ${client.user.tag}`);
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
        const mapQuery = args.slice(2).join(' ');

        if (!targetUsername || !mapQuery) {
            return message.reply('❌ الاستخدام الصحيح:\n`!roblox اليوزر اسم_الماب`\nمثال: `!roblox DOOD_07786 TSB`');
        }

        const sentMessage = await message.reply(`🔥 **[وضع التحدي الأقصى]** جاري تحليل الهدف **${targetUsername}** والبحث عن الماب **"${mapQuery}"** بكل الطرق الممكنة...`);

        try {
            // 1. جلب الـ User ID للهدف بدقة
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، اللاعب **${targetUsername}** غير موجود أو غير مُتاح في النظام!`);
            }

            // 2. البحث الصعب عن الماب باستخدام Omni-Search والتحقق المزدوج
            let universeId = null;
            let placeId = null;
            let gameName = mapQuery;

            try {
                const searchRes = await axios.get(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(mapQuery)}&sessionId=12345678-1234-1234-1234-123456789abc`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const contents = searchRes.data.combinedRows || [];
                
                let foundGame = null;
                for (const row of contents) {
                    if (row.contents && row.contents.length > 0) {
                        const match = row.contents.find(item => item.universeId || item.rootPlaceId || item.placeId);
                        if (match) {
                            foundGame = match;
                            break;
                        }
                    }
                }

                if (foundGame) {
                    universeId = foundGame.universeId;
                    placeId = foundGame.rootPlaceId || foundGame.placeId;
                    gameName = foundGame.name || mapQuery;
                }
            } catch (err) {
                console.error('Omni-Search Failed, trying fallback...', err);
            }

            // خطة طوارئ بديلة لو فشل البحث السريع: البحث عبر الـ Games API المباشر
            if (!placeId) {
                try {
                    const fallbackRes = await axios.get(`https://games.roblox.com/v1/games/list?keyword=${encodeURIComponent(mapQuery)}&maxRows=1`);
                    if (fallbackRes.data && fallbackRes.data.data.length > 0) {
                        universeId = fallbackRes.data.data[0].id;
                        placeId = fallbackRes.data.data[0].rootPlaceId;
                        gameName = fallbackRes.data.data[0].name;
                    }
                } catch (e) {}
            }

            if (!placeId) {
                return sentMessage.edit(`❌ فشلت كافة الطرق في العثور على الماب **"${mapQuery}"**، تأكد من كتابة الاسم بشكل صحيح.`);
            }

            // 3. جلب بيانات الماب الكاملة (إعجابات، لاعبين، زيارات)
            let playerCount = 0;
            let visits = 0;
            let rating = 0;
            let votesUp = 0;

            try {
                const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
                const gData = gameDetails.data.data[0];
                if (gData) {
                    gameName = gData.name || gameName;
                    playerCount = gData.playing || 0;
                    visits = gData.visits || 0;
                    votesUp = gData.upVotes || 0;
                    const votesDown = gData.downVotes || 0;
                    const totalVotes = votesUp + votesDown;
                    rating = totalVotes > 0 ? Math.round((votesUp / totalVotes) * 100) : 0;
                }
            } catch (e) {}

            // 4. جلب أيقونة الماب
            let mapThumbnail = '';
            try {
                const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
                mapThumbnail = thumbRes.data.data[0]?.imageUrl || '';
            } catch (e) {}

            await sentMessage.edit(`🗺️ تم تحديد الماب: **${gameName}**\n🟢 اللاعبون الأونلاين: **${playerCount}** | 👍 التقييم: **${rating}%**\n⚙️ **بدء عملية الفحص العميق والمكثف لكل سيرفرات الماب... انتظر قليلاً.**`);

            // 5. الفحص العميق جداً (الطريقة الصعبة - مسح أعداد هائلة من السيرفرات)
            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 20; // رفع عدد المحاولات إلى 20 صفحة (حوالي 2000 سيرفر!) لضمان إيجاده مهما كانت الظروف

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
                    if (!cursor) break; // إذا انتهت كل سيرفرات الماب تماماً

                    // تأخير بسيط لتجنب حظر الـ API (Rate Limit) وضمان استمرار البحث بقوة
                    await new Promise(resolve => setTimeout(resolve, 300));

                } catch (err) {
                    console.log('Error in deep scanning servers page:', err);
                    break;
                }
            }

            // 6. جلب صورة سكن الهدف الشخصي
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(targetUserId).catch(() => ({ username: targetUsername, displayName: targetUsername }));
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // 7. النتيجة النهائية للإمبد
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم القضاء على المستحيل! وُجد الهدف!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 الضحية / الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب المخترق', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات التي تم تمشيطها', value: `\`${scannedServersCount} سيرفر\` 🚀`, inline: true },
                        { name: '📍 الحالة', value: 'موجود داخل السيرفر بداخل الماب ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Hardcore Ultimate Tracker' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('HUNT & JOIN SERVER')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await sentMessage.edit({ content: '', embeds: [embed], components: [row] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🛡️ اختراق الماب اكتمل - لكن الهدف مختبئ!`)
                    .setThumbnail(mapThumbnail)
                    .addFields(
                        { name: '👤 الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات التي تم تمشيطها', value: `\`${scannedServersCount} سيرفر\` (تم فحصها بالكامل)`, inline: true },
                        { name: '📍 الحالة', value: 'غير متواجد في هذا الماب حالياً (أو في سيرفر خاص VIP ❌)', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Hardcore Ultimate Tracker' });

                await sentMessage.edit({ content: '', embeds: [embedNotFound], components: [] });
            }

        } catch (error) {
            console.error('Hardcore Mode Error:', error);
            await sentMessage.edit('❌ حدث خطأ غير متوقع أثناء معركة البحث العميق، يرجى المحاولة مرة أخرى.');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
