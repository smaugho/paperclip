import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEvent,
} from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "./manifest.js";

type TelegramConfig = {
  botTokenSecretRef: string;
  chatIdSecretRef: string;
  watchedIssueIds?: string[];
  watchedActorIds?: string[];
  messagePrefix?: string;
};

type CommentCreatedPayload = {
  identifier?: string;
  commentId?: string;
  bodySnippet?: string;
  issueTitle?: string;
  agentId?: string | null;
  runId?: string | null;
  [key: string]: unknown;
};

const TELEGRAM_API = "https://api.telegram.org";
const STATE_KEY_LAST_RELAY = "last-relay-at";

async function getConfig(ctx: PluginContext): Promise<TelegramConfig | null> {
  const raw = await ctx.config.get();
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;
  if (typeof cfg.botTokenSecretRef !== "string" || !cfg.botTokenSecretRef) return null;
  if (typeof cfg.chatIdSecretRef !== "string" || !cfg.chatIdSecretRef) return null;
  return {
    botTokenSecretRef: cfg.botTokenSecretRef,
    chatIdSecretRef: cfg.chatIdSecretRef,
    watchedIssueIds: Array.isArray(cfg.watchedIssueIds)
      ? (cfg.watchedIssueIds as string[])
      : [],
    watchedActorIds: Array.isArray(cfg.watchedActorIds)
      ? (cfg.watchedActorIds as string[])
      : [],
    messagePrefix: typeof cfg.messagePrefix === "string" ? cfg.messagePrefix : "",
  };
}

async function sendTelegramMessage(
  ctx: PluginContext,
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `${TELEGRAM_API}/bot${botToken}/sendMessage`;
  const response = await ctx.http.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body.slice(0, 200)}`);
  }
}

function formatCommentMessage(
  event: PluginEvent,
  payload: CommentCreatedPayload,
  prefix: string
): string {
  const identifier = payload.identifier ?? event.entityId ?? "unknown";
  const title = payload.issueTitle ? ` — ${payload.issueTitle}` : "";
  const snippet = payload.bodySnippet ?? "(no preview)";
  const actor = event.actorType === "agent" ? `Agent` : `User`;
  const actorId = event.actorId ? event.actorId.slice(0, 8) : "?";

  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  parts.push(`💬 <b>[${identifier}]</b>${title}`);
  parts.push(`New comment by ${actor} <code>${actorId}</code>`);
  parts.push(snippet.slice(0, 400));

  return parts.join("\n");
}

async function handleCommentCreated(
  ctx: PluginContext,
  event: PluginEvent
): Promise<void> {
  const config = await getConfig(ctx);
  if (!config) {
    ctx.logger.warn(`${PLUGIN_ID}: plugin not configured, skipping comment relay`);
    return;
  }

  const payload = (event.payload ?? {}) as CommentCreatedPayload;

  // Filter by watched issue IDs if configured
  if (config.watchedIssueIds && config.watchedIssueIds.length > 0) {
    const issueId = event.entityId ?? "";
    if (!config.watchedIssueIds.includes(issueId)) {
      ctx.logger.debug(`${PLUGIN_ID}: issue ${issueId} not in watch list, skipping`);
      return;
    }
  }

  // Filter by watched actor IDs if configured
  if (config.watchedActorIds && config.watchedActorIds.length > 0) {
    const actorId = event.actorId ?? "";
    if (!config.watchedActorIds.includes(actorId)) {
      ctx.logger.debug(`${PLUGIN_ID}: actor ${actorId} not in watch list, skipping`);
      return;
    }
  }

  let botToken: string;
  let chatId: string;
  try {
    botToken = await ctx.secrets.resolve(config.botTokenSecretRef);
    chatId = await ctx.secrets.resolve(config.chatIdSecretRef);
  } catch (err) {
    ctx.logger.error(`${PLUGIN_ID}: failed to resolve secrets`, { err: String(err) });
    return;
  }

  if (!botToken || !chatId) {
    ctx.logger.warn(`${PLUGIN_ID}: bot token or chat ID secret is empty`);
    return;
  }

  const message = formatCommentMessage(event, payload, config.messagePrefix ?? "");

  try {
    await sendTelegramMessage(ctx, botToken, chatId, message);
    await ctx.state.set(
      { scopeKind: "instance", stateKey: STATE_KEY_LAST_RELAY },
      new Date().toISOString()
    );
    ctx.logger.info(`${PLUGIN_ID}: relayed comment to Telegram (issue: ${event.entityId})`);
    await ctx.activity.log({
      companyId: event.companyId,
      message: `Relayed comment on issue ${event.entityId} to Telegram`,
      entityType: "issue",
      entityId: event.entityId,
    });
  } catch (err) {
    ctx.logger.error(`${PLUGIN_ID}: failed to send Telegram message`, { err: String(err) });
  }
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.logger.info(`${PLUGIN_ID}: setting up Telegram notification plugin`);

    const config = await getConfig(ctx);
    if (!config) {
      ctx.logger.warn(
        `${PLUGIN_ID}: missing required config (botTokenSecretRef, chatIdSecretRef). ` +
          "Plugin will not relay comments until configured."
      );
    }

    ctx.events.on("issue.comment.created", async (event: PluginEvent) => {
      await handleCommentCreated(ctx, event);
    });

    ctx.logger.info(`${PLUGIN_ID}: subscribed to issue.comment.created events`);
  },

  async onHealth() {
    return {
      status: "ok",
      message: `${PLUGIN_ID} ready`,
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
