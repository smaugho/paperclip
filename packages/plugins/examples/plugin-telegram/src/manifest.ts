import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.telegram";
const PLUGIN_VERSION = "0.3.1";

/**
 * Telegram notification plugin manifest.
 *
 * Subscribes to issue.comment.created events and forwards them to a
 * configured Telegram chat via the Bot API.
 *
 * Required secrets (set via board):
 *   - TELEGRAM_BOT_TOKEN  — Bot API token from @BotFather
 *   - TELEGRAM_CHAT_ID    — Target chat/channel ID
 *
 * Optional config:
 *   - watchedIssueIds  — Array of issue IDs to watch. If empty, relays all.
 *   - messagePrefix    — Optional prefix text for every message.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Telegram Notifications",
  description:
    "Relays Paperclip issue comments to a Telegram chat. Supports filtering by issue ID so you can target specific digest issues.",
  author: "DSpot",
  categories: ["automation", "connector"],
  capabilities: [
    "events.subscribe",
    "http.outbound",
    "secrets.read-ref",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      botTokenSecretRef: {
        type: "string",
        title: "Bot Token Secret Reference",
        description:
          "Secret reference key for the Telegram Bot API token (e.g. TELEGRAM_BOT_TOKEN). Store the value via the board secrets API.",
      },
      chatIdSecretRef: {
        type: "string",
        title: "Chat ID Secret Reference",
        description:
          "Secret reference key for the target Telegram chat or channel ID (e.g. TELEGRAM_CHAT_ID).",
      },
      watchedIssueIds: {
        type: "array",
        title: "Watched Issue IDs",
        description:
          "If set, only relay comments from these issue IDs (UUID list). Leave empty to relay all issue comments.",
        items: { type: "string" },
        default: [],
      },
      watchedActorIds: {
        type: "array",
        title: "Watched Actor IDs",
        description:
          "If set, only relay comments from these actor IDs (agent or user UUID list). Leave empty to relay from all actors.",
        items: { type: "string" },
        default: [],
      },
      messagePrefix: {
        type: "string",
        title: "Message Prefix",
        description: "Optional text prepended to every Telegram message.",
        default: "",
      },
    },
    required: ["botTokenSecretRef", "chatIdSecretRef"],
  },
};

export default manifest;
