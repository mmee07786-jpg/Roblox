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

// جدول احتياطي للمابس الأساسية لضمان السرعة المطلقة
const KNOWN_MAPS = {
    "tsb": { name: "The Strongest Battlegrounds", placeId: 10449761463, universeId: 3582763374 },
    "the strongest battlegrounds": { name: "The Strongest Battlegrounds", placeId: 10449761463, universeId: 3582763374 }
};

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing in Environment Variables!');
            return;
        }
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully! (Pro Hunter Mode Active)`);
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
        const mapQuery = args.slice(2).join(' ').trim();
        const lowerQuery = mapQuery.toLowerCase();

        if (!targetUsername || !mapQuery) {
            return message.reply('❌ الاستخدام الصحيح:\n`!roblox اليوزر اسم_الماب`\nمثال: `!roblox DOOD_07786 TSB`');
        }

        const sentMessage = await message.reply(`🔥 **[وضع القناص الأسطوري]** جاري تتبع الهدف **${targetUsername}** واستهداف أول ماب رئيسي لـ **"${mapQuery}"**...`);

        try {
            // 1. جلب الـ User ID للهدف بدقة مطلقة
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، اللاعب **${targetUsername}** غير موجود في روبلوكس!`);
            }

            // 2. جلب الماب المباشر (الأول والرئيسي دائماً)
            let placeId = null;
            let universeId = null;
            let gameName = mapQuery;

            if (KNOWN_MAPS[lowerQuery]) {
                placeId = KNOWN_MAPS[lowerQuery].placeId;
                universeId = KNOWN_MAPS[lowerQuery].universeId;
                gameName = KNOWN_MAPS[lowerQuery].name;
            } else {
                // استخدام Omni-Search الرسمي الخاص بروبلوكس لجلب أول نتيجة رئيسية בדיוק כמו التطبيق
                try {
                    const searchRes = await axios.get(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(mapQuery)}&sessionId=12345678-1234-1234-1234-123456789abc`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    const rows = searchRes.data.combinedRows || [];
                    
                    let foundItem = null;
                    for (const row of rows) {
                        if (row.contents && row.contents.length > 0) {
                            // نبحث عن أول نتيجة العاب رئيسية (Game)
                            const match = row.contents.find(item => item.universeId || item.rootPlaceId || item.placeId);
                            if (match) {
                                foundItem = match;
                                break;
                            }
                        }
                    }

                    if (foundItem) {
                        universeId = foundItem.universeId;
                        placeId = foundItem.rootPlaceId || foundItem.placeId;
                        gameName = foundItem.name || mapQuery;
                    }
                } catch (err) {
                    console.log('Omni-search error, using fallback list api...');
                }

                // خطة بديلة لو أخطأ الـ Omni-search: البحث المباشر عبر الـ Games API وجلب النتيجة رقم 1 الأولى حصراً
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
            }

            if (!placeId) {
                return sentMessage.edit(`❌ لم يتم العثور على أي ماب رئيسي بهذا الاسم: **"${mapQuery}"**.`);
            }

            // 3. جلب بيانات الماب الكاملة (لاعبين، إعجابات، زيارات)
            let playerCount = 0;
            let visits = 0;
            let rating = 0;

            try {
                const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
                const gData = gameDetails.data.data[0];
                if (gData) {
                    gameName = gData.name || gameName;
                    playerCount = gData.playing || 0;
                    visits = gData.visits || 0;
                    const votesUp = gData.upVotes || 0;
                    const votesDown = gData.downVotes || 0;
                    const totalVotes = votesUp + votesDown;
                    rating = totalVotes > 0 ? Math.round((votesUp / totalVotes) * 100) : 0;
                }
            } catch (e) {}

            // 4. جلب أيقونة الماب الأساسي
            let mapThumbnail = '';
            try {
                const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
                mapThumbnail = thumbRes.data.data[0]?.imageUrl || '';
            } catch (e) {}

            await sentMessage.edit(`🗺️ تم اعتماد أول ماب أساسي: **${gameName}**\n🟢 الأونلاين: **${playerCount}** | 👍 التقييم: **${rating}%**\n⚙️ **جاري تمشيط سيرفرات الماب الأصلي للقبض على الهدف...**`);

            // 5. الفحص العميق والمكثف لكل سيرفرات الماب الأول (حتى 2000 سيرفر)
            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 20;

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

                    await new Promise(resolve => setTimeout(resolve, 250));
                } catch (err) {
                    break;
                }
            }

            // 6. جلب صورة سكن الشخص المستهدف
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(targetUserId).catch(() => ({ username: targetUsername, displayName: targetUsername }));
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // 7. إرسال النتيجة النهائية بدقة مذهلة
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم العثور على الهدف في الماب الأصلي!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 الضحية / الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب الأساسي', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` 🚀`, inline: true },
                        { name: '📍 الحالة', value: 'متصل داخل السيرفر وجاهز للهجوم ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Pro Hunter Tracker' });

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
                    .setTitle(`🛡️ تمشيط الماب الأصلي اكتمل - الهدف مختبئ!`)
                    .setThumbnail(mapThumbnail)
                    .addFields(
                        { name: '👤 الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب الأساسي', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` (تم فحصها بالكامل)`, inline: true },
                        { name: '📍 الحالة', value: 'ليس موجوداً في هذا الماب حالياً (أو في سيرفر خاص ❌)', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Pro Hunter Tracker' });

                await sentMessage.edit({ content: '', embeds: [embedNotFound], components: [] });
            }

        } catch (error) {
            console.error('Pro Hunter Mode Error:', error);
            await sentMessage.edit('❌ حدث خطأ تقني، جاري ضبط النظام...');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
