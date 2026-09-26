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
        // الصيغة: !roblox اليوزر اسم_الماب (مثال: !roblox DOOD_07786 TSB)
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
                return sentMessage.edit(`❌ عذراً، لم يتم العثور على اللاعب **${targetUsername}**!`);
            }

            // 2. البحث عن الماب بالاسم (Keyword Search)
            let gameData = null;
            try {
                const searchRes = await axios.get(`https://games.roblox.com/v1/games/list?keyword=${encodeURIComponent(mapQuery)}&maxRows=1`);
                const games = searchRes.data.data || [];
                if (games.length > 0) {
                    gameData = games[0];
                }
            } catch (err) {
                console.error('Error searching game:', err);
            }

            if (!gameData) {
                return sentMessage.edit(`❌ لم يتم العثور على أي ماب بهذا الاسم: **"${mapQuery}"**`);
            }

            const universeId = gameData.id;
            const placeId = gameData.rootPlaceId;
            const gameName = gameData.name;
            const playerCount = gameData.playing || 0;
            const visits = gameData.visits || 0;
            const votesUp = gameData.upVotes || 0;
            const votesDown = gameData.downVotes || 0;
            
            // حساب نسبة الإعجاب بالمئة
            const totalVotes = votesUp + votesDown;
            const rating = totalVotes > 0 ? Math.round((votesUp / totalVotes) * 100) : 0;

            // 3. جلب صورة أيقونة الماب وصورة البانر
            let mapThumbnail = '';
            try {
                const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
                mapThumbnail = thumbRes.data.data[0]?.imageUrl || '';
            } catch (e) {}

            await sentMessage.edit(`🗺️ تم العثور على الماب: **${gameName}**\n👥 اللاعبون الآن: **${playerCount}** | 👍 الإعجابات: **${rating}%**\n🔍 جاري بدء فحص السيرفرات للبحث عن **${targetUsername}**...`);

            // 4. البحث العميق في سيرفرات الماب
            let scannedServersCount = 0;
            let foundServer = null;
            let cursor = '';
            let attempts = 0;
            const maxAttempts = 8; // فحص حتى 800 سيرفر

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

            // 5. جلب صورة سكن اللاعب
            let avatarUrl = '';
            try {
                const thumbResponse = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${targetUserId}&size=420x420&format=Png&isCircular=false`);
                avatarUrl = thumbResponse.data.data[0]?.imageUrl || '';
            } catch (err) {}

            const userInfo = await noblox.getPlayerInfo(targetUserId).catch(() => ({ username: targetUsername, displayName: targetUsername }));
            const username = userInfo.username || targetUsername;
            const displayName = userInfo.displayName || username;

            // بناء الإمبد والنتيجة النهائية
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎮 تم العثور على اللاعب في الماب!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 اللاعب', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 المتواجدون: \`${playerCount}\`\n👍 نسبة الإعجاب: \`${rating}%\` (\`${votesUp}\` إعجاب)\n👁️ الزيارات: \`${visits.toLocaleString()}\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\``, inline: true },
                        { name: '📍 الحالة', value: 'متصل داخل سيرفر ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Smart Map & Player Scanner' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Join Game')
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
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 المتواجدون: \`${playerCount}\`\n👍 نسبة الإعجاب: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\``, inline: true },
                        { name: '📍 الحالة', value: 'لم يتم العثور عليه في سيرفرات هذا الماب ❌', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Smart Map & Player Scanner' });

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
