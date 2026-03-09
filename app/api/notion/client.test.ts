import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildRichText,
  buildMessageBlocks,
  SlackMessage,
} from "./client";

// Notion APIクライアントをモック
vi.mock("@notionhq/client", () => ({
  Client: class {
    databases = { query: vi.fn() };
    pages = { update: vi.fn() };
    blocks = {
      children: {
        append: vi.fn().mockResolvedValue({ results: [] }),
      },
    };
  },
}));

describe("buildRichText", () => {
  it("プレーンテキストをrich_text配列に変換する", () => {
    const result = buildRichText("hello world");
    expect(result).toEqual([
      { type: "text", text: { content: "hello world" } },
    ]);
  });

  it("URLをリンク付きrich_textに変換する", () => {
    const result = buildRichText("check https://example.com please");
    expect(result).toEqual([
      { type: "text", text: { content: "check " } },
      {
        type: "text",
        text: {
          content: "https://example.com",
          link: { url: "https://example.com" },
        },
      },
      { type: "text", text: { content: " please" } },
    ]);
  });

  it("複数のURLを正しく処理する", () => {
    const result = buildRichText(
      "see https://a.com and https://b.com done"
    );
    expect(result).toHaveLength(5);
    expect(result[1]).toEqual({
      type: "text",
      text: { content: "https://a.com", link: { url: "https://a.com" } },
    });
    expect(result[3]).toEqual({
      type: "text",
      text: { content: "https://b.com", link: { url: "https://b.com" } },
    });
  });

  it("Slackスタイルのemojiを変換する", () => {
    const result = buildRichText(":smile: hello");
    // emoji-datasourceの😄に変換される
    expect(result[0].type).toBe("text");
    const content = (result[0].text as { content: string }).content;
    expect(content).not.toContain(":smile:");
    expect(content).toContain("hello");
  });

  it("存在しないemojiはそのまま残す", () => {
    const result = buildRichText(":nonexistent_emoji_xyz:");
    const content = (result[0].text as { content: string }).content;
    expect(content).toBe(":nonexistent_emoji_xyz:");
  });

  it("空文字列を処理できる", () => {
    const result = buildRichText("");
    expect(result).toEqual([
      { type: "text", text: { content: "" } },
    ]);
  });
});

describe("buildMessageBlocks", () => {
  it("単一の親メッセージを箇条書きブロックに変換する", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "parent message",
        thread_ts: "1",
        reply_count: 0,
        parent_user_id: null,
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("bulleted_list_item");
    expect(blocks[0].bulleted_list_item.rich_text).toEqual(
      buildRichText("parent message")
    );
    expect(blocks[0].bulleted_list_item.children).toBeUndefined();
  });

  it("スレッド返信を親メッセージのchildrenにネストする", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "parent msg",
        thread_ts: "1",
        reply_count: 1,
        parent_user_id: null,
      },
      {
        ts: "2",
        text: "reply msg",
        thread_ts: "1",
        reply_count: null,
        parent_user_id: "U123",
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].bulleted_list_item.rich_text).toEqual(
      buildRichText("parent msg")
    );
    expect(blocks[0].bulleted_list_item.children).toHaveLength(1);
    expect(blocks[0].bulleted_list_item.children![0].type).toBe(
      "bulleted_list_item"
    );
    expect(
      blocks[0].bulleted_list_item.children![0].bulleted_list_item.rich_text
    ).toEqual(buildRichText("reply msg"));
  });

  it("複数の返信を持つスレッドを正しく処理する", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "parent",
        thread_ts: "1",
        reply_count: 2,
        parent_user_id: null,
      },
      {
        ts: "2",
        text: "reply1",
        thread_ts: "1",
        parent_user_id: "U123",
      },
      {
        ts: "3",
        text: "reply2",
        thread_ts: "1",
        parent_user_id: "U456",
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].bulleted_list_item.children).toHaveLength(2);
  });

  it("複数の独立したメッセージを別々のブロックにする", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "msg1",
        thread_ts: "1",
        parent_user_id: null,
      },
      {
        ts: "2",
        text: "msg2",
        thread_ts: "2",
        parent_user_id: null,
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].bulleted_list_item.rich_text).toEqual(
      buildRichText("msg1")
    );
    expect(blocks[1].bulleted_list_item.rich_text).toEqual(
      buildRichText("msg2")
    );
  });

  it("独立メッセージとスレッド付きメッセージを混在させて処理する", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "standalone",
        thread_ts: "1",
        parent_user_id: null,
      },
      {
        ts: "10",
        text: "threaded parent",
        thread_ts: "10",
        reply_count: 1,
        parent_user_id: null,
      },
      {
        ts: "11",
        text: "threaded reply",
        thread_ts: "10",
        parent_user_id: "U789",
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(2);
    // 独立メッセージにはchildrenなし
    expect(blocks[0].bulleted_list_item.children).toBeUndefined();
    // スレッド付きメッセージにはchildrenあり
    expect(blocks[1].bulleted_list_item.children).toHaveLength(1);
  });

  it("親メッセージがないグループはスキップする", () => {
    const messages: SlackMessage[] = [
      {
        ts: "2",
        text: "orphan reply",
        thread_ts: "1",
        parent_user_id: "U123",
      },
    ];

    const blocks = buildMessageBlocks(messages);
    expect(blocks).toHaveLength(0);
  });

  it("メッセージ内のURLとemojiが正しく変換される", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: ":smile: check https://example.com",
        thread_ts: "1",
        parent_user_id: null,
      },
    ];

    const blocks = buildMessageBlocks(messages);
    const richText = blocks[0].bulleted_list_item.rich_text;
    // URLがリンク付きrich_textになっている
    const linkItem = richText.find(
      (item) => "link" in item.text
    );
    expect(linkItem).toBeDefined();
    // emojiが変換されている
    const textItem = richText[0];
    const content = (textItem.text as { content: string }).content;
    expect(content).not.toContain(":smile:");
  });

  it("空の配列を渡すと空の配列を返す", () => {
    const blocks = buildMessageBlocks([]);
    expect(blocks).toEqual([]);
  });

  it("fromを指定すると親メッセージの末尾にfromが付与される", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "parent msg",
        thread_ts: "1",
        reply_count: 1,
        parent_user_id: null,
      },
      {
        ts: "2",
        text: "reply msg",
        thread_ts: "1",
        parent_user_id: "U123",
      },
    ];

    const blocks = buildMessageBlocks(messages, "#times_yumikokh");
    const parentRichText = blocks[0].bulleted_list_item.rich_text;
    // 最後の要素にfromが含まれる
    const lastItem = parentRichText[parentRichText.length - 1];
    expect((lastItem.text as { content: string }).content).toBe(
      " #times_yumikokh"
    );
    // 返信にはfromが付かない
    const replyRichText =
      blocks[0].bulleted_list_item.children![0].bulleted_list_item.rich_text;
    const replyTexts = replyRichText.map(
      (item) => (item.text as { content: string }).content
    );
    expect(replyTexts.join("")).not.toContain("#times_yumikokh");
  });

  it("fromを指定しない場合は付与されない", () => {
    const messages: SlackMessage[] = [
      {
        ts: "1",
        text: "hello",
        thread_ts: "1",
        parent_user_id: null,
      },
    ];

    const blocks = buildMessageBlocks(messages);
    const richText = blocks[0].bulleted_list_item.rich_text;
    expect(richText).toEqual(buildRichText("hello"));
  });
});
