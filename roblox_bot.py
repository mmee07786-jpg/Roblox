import os
import time
import discord
from discord.ext import commands
import requests

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"🚀 | بوت روبلوكس الذكي شغال وجاهز باسم: {bot.user.name}")

@bot.command(name="roblox", help="يبحث عن لاعب بروبلوكس بمرونة وصبر ذكي")
async def roblox_profile(ctx, username: str):
    waiting_msg = await ctx.send(f"🔍 | جاري البحث عن اللاعب **{username}** (البوت يأخذ وقته ويدور ببراحة إذا احتاج الأمر)...")

    # دالة مساعدة لعمل طلبات HTTP مع نظام إعادة محاولة ذكي وصبر
    def fetch_with_patience(url, method="get", json_data=None, max_retries=3):
        for attempt in range(max_retries):
            try:
                # محاولة سريعة بالبداية (مهلة قصيرة 5 ثواني)
                if method == "get":
                    res = requests.get(url, timeout=5)
                else:
                    res = requests.post(url, json=json_data, timeout=5)
                
                if res.status_code == 200:
                    return res.json()
                elif res.status_code == 429: # ضغط على السيرفر (Rate Limit)
                    time.sleep(3) # ينتظر شوي ويدور مرة ثانية
                else:
                    return None
            except requests.exceptions.Timeout:
                # إذا صار بطء، البوت ياخذ راحته ويزيد وقت الانتظار بالمحاولة التالية
                if attempt == max_retries - 1:
                    raise Exception("استغرق الاتصال وقتاً طويلاً جداً، يرجى المحاولة لاحقاً.")
                time.sleep(2)
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
            time.sleep(1)
        return None

    try:
        # الخطوة 1: البحث عن الـ User ID
        url_search = "https://users.roblox.com/v1/usernames/users"
        payload = {"usernames": [username], "excludeBannedUsers": True}
        
        data = fetch_with_patience(url_search, method="post", json_data=payload)

        if not data or not data.get("data"):
            await waiting_msg.edit(content=f"❌ | عذراً، اللاعب **{username}** غير موجود أو تم حظره، أو أن سيرفرات روبلوكس بطيئة حالياً.")
            return

        user_info = data["data"][0]
        user_id = user_info["id"]
        display_name = user_info.get("displayName", username)
        real_name = user_info["name"]

        # الخطوة 2: جلب تفاصيل الحساب الصبرية
        url_details = f"https://users.roblox.com/v1/users/{user_id}"
        details_res = fetch_with_patience(url_details, method="get")
        
        description = "لا توجد نبذة تعريفية."
        created_at = "غير معروف"
        is_banned = False

        if details_res:
            description = details_res.get("description", "لا توجد نبذة تعريفية.")
            created_at = details_res.get("created", "غير معروف")[:10]
            is_banned = details_res.get("isBanned", False)

        # الخطوة 3: جلب صورة الأفاتار 3D
        url_avatar = f"https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds={user_id}&size=420x420&format=Png&isCircular=false"
        avatar_res = fetch_with_patience(url_avatar, method="get")
        
        avatar_url = ""
        if avatar_res and avatar_res.get("data"):
            avatar_url = avatar_res["data"][0]["imageUrl"]

        # بناء واجهة العرض (Embed)
        embed = discord.Embed(
            title=f"🎮 ملف اللاعب: {real_name}",
            url=f"https://www.roblox.com/users/{user_id}/profile",
            color=discord.Color.blue()
        )
        
        if avatar_url:
            embed.set_thumbnail(url=avatar_url)

        embed.add_field(name="🔹 Display Name", value=display_name, inline=True)
        embed.add_field(name="🆔 User ID", value=str(user_id), inline=True)
        embed.add_field(name="📅 تاريخ الإنشاء", value=created_at, inline=True)
        embed.add_field(name="⚠️ الحظر", value="محظور" if is_banned else "حساب نشط ومتاح", inline=True)
        
        if len(description) > 100:
            description = description[:100] + "..."
        embed.add_field(name="💬 البايو (Bio)", value=description or "فارغ", inline=False)

        embed.set_footer(text=f"طلب بواسطة: {ctx.author.name}", icon_url=ctx.author.avatar.url if ctx.author.avatar else None)

        await waiting_msg.edit(content=None, embed=embed)

    except Exception as e:
        await waiting_msg.edit(content=f"⚠️ | حدث خطأ تقني، لكن البوت حاول يصبر ويدور: {str(e)}")

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)

