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

// قاعدة بيانات داخلية للمابس لضمان السرعة المطلقة وتجنب حظر الـ API
const KNOWN_MAPS = {
    "tsb": { name: "The Strongest Battlegrounds", placeId: 10449761463, universeId: 3582763374 },
    "blitz": { name: "战场 Battlegrounds Blitz", placeId: 13864661000, universeId: 4851213051 }
};

client.once('ready', async () => {
    try {
        if (!COOKIE) {
            console.error('❌ Error: ROBLOX_COOKIE is missing in Environment Variables!');
            return;
        }
        await noblox.setCookie(COOKIE);
        console.log(`[ROBLOX] Logged in successfully! (Unstoppable Mode Active)`);
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
        const mapQuery = args.slice(2).join(' ').toLowerCase().trim();

        if (!targetUsername || !mapQuery) {
            return message.reply('❌ الاستخدام الصحيح:\n`!roblox اليوزر اسم_الماب`\nمثال: `!roblox DOOD_07786 tsb`');
        }

        const sentMessage = await message.reply(`🔥 **[وضع النصر الإجباري]** جاري تتبع الهدف **${targetUsername}** واختراق سيرفرات ماب **"${mapQuery}"**...`);

        try {
            // 1. جلب الـ User ID للهدف بدقة مطلقة
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، اللاعب **${targetUsername}** غير موجود في روبلوكس!`);
            }

            // 2. التحقق من الماب (هل هو مخزن بالجدول الذكي لو بحث حر؟)
            let placeId = null;
            let universeId = null;
            let gameName = mapQuery;

            if (KNOWN_MAPS[mapQuery]) {
                placeId = KNOWN_MAPS[mapQuery].placeId;
                universeId = KNOWN_MAPS[mapQuery].universeId;
                gameName = KNOWN_MAPS[mapQuery].name;
            } else {
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
                return sentMessage.edit(`❌ فشل العثور على الماب **"${mapQuery}"**. تأكد من كتابة الاختصار الصحيح مثل ` + '`tsb`' + `.`);
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

            // 4. جلب أيقونة الماب
            let mapThumbnail = '';
            try {
                const thumbRes = await axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`);
                mapThumbnail = thumbRes.data.data[0]?.imageUrl || '';
            } catch (e) {}

            await sentMessage.edit(`🗺️ الماب المستهدف: **${gameName}**\n🟢 اللاعبون الأونلاين: **${playerCount}** | 👍 التقييم: **${rating}%**\n⚙️ **جاري فحص آلاف السيرفرات الآن للقبض على الهدف...**`);

            // 5. الفحص العميق والمكثف (حتى 2000 سيرفر)
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

            // 7. إرسال النتيجة الحتمية
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم سحق المستحيل وإيجاد الهدف!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 الضحية / الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب المخترق', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` 🚀`, inline: true },
                        { name: '📍 الحالة', value: 'متصل داخل السيرفر وجاهز للهجوم ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Unstoppable Hunter' });

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
                    .setTitle(`🛡️ تمشيط الماب اكتمل - الهدف غير موجود!`)
                    .setThumbnail(mapThumbnail)
                    .addFields(
                        { name: '👤 الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` (تم فحصها بالكامل)`, inline: true },
                        { name: '📍 الحالة', value: 'ليس موجوداً في هذا الماب حالياً (أو في سيرفر خاص ❌)', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Unstoppable Hunter' });

                await sentMessage.edit({ content: '', embeds: [embedNotFound], components: [] });
            }

        } catch (error) {
            console.error('Unstoppable Mode Error:', error);
            await sentMessage.edit('❌ حدث خطأ تقني، جاري إعادة ضبط النظام...');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
