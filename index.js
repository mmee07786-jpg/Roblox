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
        const mapQuery = args.slice(2).join(' ');

        if (!targetUsername || !mapQuery) {
            return message.reply('❌ يرجى كتابة الأمر بالشكل الصحيح:\nمثال: `!roblox DOOD_07786 TSB`');
        }

        const sentMessage = await message.reply(`🔍 جاري البحث عن الماب **"${mapQuery}"** ومعلومات اللاعب **${targetUsername}**...`);

        try {
            // 1. جلب الـ User ID للاعب
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، لم يتم العثور على اللاعب **${targetUsername}** في روبلوكس!`);
            }

            // 2. البحث عن الماب باستخدام نظام روبلوكس الحديث واختيار أول نتيجة تلقائياً
            let universeId = null;
            let placeId = null;
            let gameName = mapQuery;

            try {
                const searchRes = await axios.get(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(mapQuery)}&sessionId=12345678-1234-1234-1234-123456789abc`);
                const contents = searchRes.data.combinedRows || [];
                
                let foundGame = null;
                for (const row of contents) {
                    if (row.contents && row.contents.length > 0) {
                        const match = row.contents.find(item => item.universeId || item.rootPlaceId);
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
                console.error('Search API Error:', err);
            }

            // لو ما جاب الـ Place ID من البحث السريع، نجرب نلتقطه عبر طريقة احتياطية أو نوقف
            if (!universeId || !placeId) {
                return sentMessage.edit(`❌ لم يتم العثور على أي ماب يطابق البحث: **"${mapQuery}"**`);
            }

            // 3. جلب إحصائيات الماب الحقيقية (لاعبين، إعجابات، زيارات)
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

            // 4. جلب صورة أيقونة الماب
            let mapThumbnail = '';
            try {
                const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
                mapThumbnail = thumbRes.data.data[0]?.imageUrl || '';
            } catch (e) {}

            await sentMessage.edit(`🗺️ تم اختيار أول ماب: **${gameName}**\n👥 اللاعبون الآن: **${playerCount}** | 👍 الإعجابات: **${rating}%**\n🔍 جاري بدء فحص السيرفرات للبحث عن اللاعب **${targetUsername}**...`);

            // 5. البحث العميق في سيرفرات الماب المختار
            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 8; // يفحص لغاية 800 سيرفر

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

                } catch (err) {
                    break;
                }
            }

            // 6. جلب صورة سكن اللاعب
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(targetUserId).catch(() => ({ username: targetUsername, displayName: targetUsername }));
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // إرسال النتيجة النهائية
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎮 تم العثور على اللاعب في الماب!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ اسم الماب المختار', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 المتواجدون: \`${playerCount}\`\n👍 نسبة الإعجاب: \`${rating}%\`\n👁️ الزيارات: \`${visits.toLocaleString()}\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\``, inline: true },
                        { name: '📍 الحالة', value: 'متصل داخل سيرفر ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Omni-Search & Player Scanner' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Join Game Server')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await sentMessage.edit({ content: '', embeds: [embed], components: [row] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🎮 معلومات الماب واللاعب`)
                    .setThumbnail(mapThumbnail)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ اسم الماب المختار', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 المتواجدون: \`${playerCount}\`\n👍 نسبة الإعجاب: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\``, inline: true },
                        { name: '📍 الحالة', value: 'لم يتم العثور عليه في سيرفرات هذا الماب ❌', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Omni-Search & Player Scanner' });

                await sentMessage.edit({ content: '', embeds: [embedNotFound], components: [] });
            }

        } catch (error) {
            console.error('Main Error:', error);
            await sentMessage.edit('❌ حدث خطأ أثناء البحث عن الماب أو اللاعب.');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
