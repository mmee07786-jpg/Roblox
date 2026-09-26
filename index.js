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

// قائمة الأغاني العشوائية (كل بحث جديد يختار أغنية واحدة فقط)
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
        console.log(`[ROBLOX] Logged in successfully! (Smart Single Audio Mode Active)`);
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

        if (!targetUsername || !mapQuery) {
            return message.reply('❌ الاستخدام الصحيح:\n`!roblox اليوزر اسم_الماب`\nمثال: `!roblox IIIIIIIIII24 TSB`');
        }

        const sentMessage = await message.reply(`🔥 **[النظام الذكي]** جاري البحث عن أشهر ماب لـ **"${mapQuery}"** واستهداف اللاعب **${targetUsername}**...`);

        try {
            // 1. جلب الـ User ID للهدف بدقة مطلقة
            let targetUserId;
            try {
                targetUserId = await noblox.getIdFromUsername(targetUsername);
            } catch (e) {
                return sentMessage.edit(`❌ عذراً، اللاعب **${targetUsername}** غير موجود في روبلوكس!`);
            }

            // 2. البحث الذكي لجلب المابات العامة الكبرى وتجنب المابات الشخصية
            let placeId = null;
            let universeId = null;
            let gameName = mapQuery;

            try {
                const searchRes = await axios.get(`https://games.roblox.com/v1/games/list?keyword=${encodeURIComponent(mapQuery)}&maxRows=20`);
                const games = searchRes.data.data || [];

                const validGames = games.filter(g => g.name && !g.name.toLowerCase().includes("'s place"));
                const bestMatch = validGames.length > 0 ? validGames[0] : (games.length > 0 ? games[0] : null);

                if (bestMatch) {
                    universeId = bestMatch.id;
                    placeId = bestMatch.rootPlaceId;
                    gameName = bestMatch.name;
                }
            } catch (err) {
                console.error('Map Search Error:', err);
            }

            if (!placeId) {
                return sentMessage.edit(`❌ لم يتم العثور على ماب رسمي بهذا الاسم: **"${mapQuery}"**.`);
            }

            // 3. جلب بيانات الماب الكاملة (لاعبين، تقييم)
            let playerCount = 0;
            let rating = 0;

            try {
                const gameDetails = await axios.get(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
                const gData = gameDetails.data.data[0];
                if (gData) {
                    gameName = gData.name || gameName;
                    playerCount = gData.playing || 0;
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

            await sentMessage.edit(`🗺️ الماب الرسمي المستهدف: **${gameName}**\n🟢 الأونلاين: **${playerCount}** | 👍 التقييم: **${rating}%**\n⚙️ **جاري فحص سيرفرات الماب للعثور على اللاعب...**`);

            // 5. الفحص العميق لسيرفرات الماب
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

            // اختيار أغنية عشوائية واحدة فقط لهذا البحث حصراً
            const selectedSong = randomAudioTracks[Math.floor(Math.random() * randomAudioTracks.length)];

            // 7. إرسال النتيجة النهائية مع الأغنية الواحدة المختارة والزر المخصص
            if (foundServer) {
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle(`🎯 تم العثور على الهدف داخل الماب!`)
                    .setThumbnail(mapThumbnail)
                    .setImage(avatarUrl)
                    .addFields(
                        { name: '👤 الضحية / الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` 🚀`, inline: true },
                        { name: '📍 الحالة', value: 'متصل داخل السيرفر وجاهز للهجوم ✅', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Smart Hunter Tracker' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(`الـبحث عن الاعب ب ${gameName}`.substring(0, 80))
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}&linkCode=${foundServer.id}`)
                    );

                await sentMessage.edit({ content: `🎵 **معزوفة مختارة لهذا البحث:**\n${selectedSong}`, embeds: [embed], components: [row] });
            } else {
                const embedNotFound = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle(`🛡️ تمشيط الماب اكتمل - الهدف غير موجود!`)
                    .setThumbnail(mapThumbnail)
                    .addFields(
                        { name: '👤 الهدف', value: `\`${displayName}\` (@${username})`, inline: false },
                        { name: '🗺️ اسم الماب', value: `**${gameName}**`, inline: false },
                        { name: '📊 إحصائيات الماب', value: `🟢 الأونلاين: \`${playerCount}\` | 👍 التقييم: \`${rating}%\``, inline: false },
                        { name: '🔍 السيرفرات المفحوصة', value: `\`${scannedServersCount} سيرفر\` (تم فحصها بالكامل)`, inline: true },
                        { name: '📍 الحالة', value: 'ليس موجوداً في هذا الماب حالياً (أو في سيرفر خاص ❌)', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Roblox Smart Hunter Tracker' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel(`الـبحث عن الاعب ب ${gameName}`.substring(0, 80))
                            .setStyle(ButtonStyle.Link)
                            .setURL(`roblox://placeId=${placeId}`)
                    );

                await sentMessage.edit({ content: `🎵 **معزوفة مختارة لهذا البحث:**\n${selectedSong}`, embeds: [embedNotFound], components: [row] });
            }

        } catch (error) {
            console.error('Smart Mode Error:', error);
            await sentMessage.edit('❌ حدث خطأ تقني، يرجى المحاولة لاحقاً.');
        }
    }
});

const DIS_BOT_TOKEN = process.env.DISCORD_TOKEN;
if (!DIS_BOT_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN is missing in Environment Variables!');
} else {
    client.login(DIS_BOT_TOKEN);
}
