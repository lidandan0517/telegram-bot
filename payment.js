// ========================================================
// 模块：付费入群核心业务系统 (独立解耦模块)
// ========================================================

// 辅助请求方法（复用 Telegram Bot API）
async function tgPost(env, method, body) {
    let base = env.API_BASE || "https://api.telegram.org";
    if (base.startsWith("http://")) base = base.replace("http://", "https://");
    const resp = await fetch(`${base}/bot${env.BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    return await resp.json();
}

/**
 * 路由分流器：判断并处理所有与付费相关的事件
 * @returns {Promise<boolean>} 如果已被付费系统消费，返回 true；否则返回 false（放行给老客服）
 */
export async function handlePaymentUpdate(update, env, ctx) {
    // ----------------------------------------------------
    // 1. 拦截私聊中的 /buy、/vip 或"购买"等指令
    // ----------------------------------------------------
    if (update.message && update.message.chat?.type === "private") {
        const text = (update.message.text || "").trim();
        const userId = update.message.chat.id;

        if (text === "/buy" || text === "/vip" || text === "购买" || text === "加入VIP") {
            await sendPaymentPlans(userId, env);
            return true; // 拦截成功，不触发老客服逻辑
        }
    }

    // ----------------------------------------------------
    // 2. 拦截支付按钮的点击回调 (Callback Query)
    // ----------------------------------------------------
    if (update.callback_query) {
        const data = update.callback_query.data || "";
        const userId = update.callback_query.from.id;
        const queryId = update.callback_query.id;

        // 判断是否是支付模块的按钮（特征前缀：pay_）
        if (data.startsWith("pay_")) {
            await handlePaymentCallback(queryId, userId, data, env);
            return true; // 拦截成功
        }
    }

    // ----------------------------------------------------
    // 3. 拦截群成员变动事件 (chat_member / chat_join_request)
    // ----------------------------------------------------
    if (update.chat_member || update.chat_join_request) {
        const event = update.chat_member || update.chat_join_request;
        // 如果需要监听用户进群或审批入群请求，在这里处理
        console.log("收到入群变动事件:", JSON.stringify(event));
        return true; // 拦截成功
    }

    // ----------------------------------------------------
    // 4. 不是付费系统的消息，彻底放行！
    // ----------------------------------------------------
    return false;
}

/**
 * 外部支付网关 Webhook 接收器 (如 USDT、Stripe、Epusdt 等异步通知)
 */
export async function handlePaymentNotify(request, env, ctx) {
    try {
        const payload = await request.json();
        console.log("收到外部支付回调通知:", payload);

        // TODO: 校验支付签名，若支付成功，给用户生成进群链接并发送
        // const inviteLink = await createSingleUseInviteLink(env.VIP_GROUP_ID, env);
        // await tgPost(env, "sendMessage", { chat_id: targetUserId, text: `🎉 支付成功！专属入群链接: ${inviteLink}` });

        return new Response("SUCCESS", { status: 200 });
    } catch (e) {
        return new Response("Webhook Error", { status: 400 });
    }
}

// --- 内部业务子函数 ---

// 发送套餐选择面板
async function sendPaymentPlans(userId, env) {
    const text = `💎 **VIP 专属会员订阅**\n\n加入群组即可享受专属独家内容。\n请选择您需要开通的时长：`;
    const keyboard = [
        [
            { text: "月度 VIP - $9.9", callback_data: "pay_plan_monthly" },
            { text: "季度 VIP - $24.9", callback_data: "pay_plan_quarterly" }
        ],
        [
            { text: "永久 VIP - $99.0", callback_data: "pay_plan_lifetime" }
        ]
    ];

    await tgPost(env, "sendMessage", {
        chat_id: userId,
        text: text,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: keyboard }
    });
}

// 处理点击支付按钮
async function handlePaymentCallback(queryId, userId, data, env) {
    await tgPost(env, "answerCallbackQuery", { callback_query_id: queryId });

    if (data === "pay_plan_monthly") {
        // 示例：提示用户如何支付或弹出支付二维码/链接
        await tgPost(env, "sendMessage", {
            chat_id: userId,
            text: `💳 **您已选择：月度 VIP**\n\n请点击下方链接完成支付（支持 USDT / 信用卡等）：\nhttps://your-payment-gateway.com/pay?user=${userId}&plan=monthly\n\n支付成功后机器人会自动发放单次入群邀请链接！`,
            parse_mode: "Markdown"
        });
    } else {
        await tgPost(env, "sendMessage", {
            chat_id: userId,
            text: `🛠 该套餐正在配置中，请联系人工客服。`
        });
    }
}

// 生成一次性入群链接工具函数
export async function createSingleUseInviteLink(chatId, env) {
    const res = await tgPost(env, "createChatInviteLink", {
        chat_id: chatId,
        member_limit: 1, // 限1人使用
        expire_date: Math.floor(Date.now() / 1000) + 86400 // 24小时有效
    });
    return res.result?.invite_link;
}
