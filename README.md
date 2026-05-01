# Rovo Chat Exporter

Atlassian Rovo のチャット履歴を **Markdown ファイルとしてエクスポート**するブラウザスクリプトです。

ユーザーメッセージ・Rovo レスポンスの両方を `ak-renderer-document` から直接 DOM パースして取得します。クリップボード API に一切依存しないため、ブックマークレット実行時のセキュリティ制限やコピーボタンの仕様変更に影響されません。

---

## 特徴

- **完全 DOM パース方式** — クリップボード API に依存しない。ブックマークレットの権限制限を受けない
- **発言順序を保証** — `rovo-chat-message-group` を DOM 順に走査するため、ユーザー→Rovo の順が崩れない
- **ユーザー・Rovo の両メッセージ対応** — `ContentContainer`（ユーザー）と `data-scroll-anchor="assistant-message"`（Rovo）で確実に区別
- **書式を再現** — テーブル・コードブロック・リスト・太字・インラインコード・リンクなどに対応
- **ファイル添付があっても正常動作** — テキスト部分のみ抽出
- **ファイル名自動生成** — ページタイトルから会話名を取得

---

## 使い方

### 方法 A: コンソールで直接実行（簡単）

1. Rovo のチャットページを開き、会話が完全に読み込まれるまで待つ
2. ブラウザの開発者コンソールを開く
   - Chrome / Edge: `F12` または `Ctrl+Shift+J`（Windows/Linux）/ `Cmd+Option+J`（Mac）
   - Firefox: `F12` または `Ctrl+Shift+K`（Windows/Linux）/ `Cmd+Option+K`（Mac）
   - Safari: 環境設定で「開発」メニューを有効にしてから `Cmd+Option+C`
3. `rovo-chat-exporter.js` の内容をすべてコピーしてコンソールに貼り付ける
4. `Enter` で実行する
5. 自動的に `{タイトル}.md` がダウンロードされます

### 方法 B: ブックマークレットとして登録（便利）

1. ブラウザで「ブックマークを追加」を開く（`Ctrl+D` / `Cmd+D`）
2. 名前を `Rovo Export` などに設定する
3. URL 欄に以下を貼り付ける

```
javascript:(function(){function setupRovoExporter(){const SELECTORS={userContainer:'[data-sentry-component="ContentContainer"]',rovoContainer:'[data-scroll-anchor="assistant-message"]',rendererDoc:'.ak-renderer-document'};const statusDiv=document.createElement('div');statusDiv.style.cssText='position:fixed;top:10px;right:10px;z-index:10000;background:#0052CC;color:white;padding:10px 15px;border-radius:5px;font-family:monospace;font-size:12px;box-shadow:0 2px 10px rgba(0,0,0,0.3);max-width:300px;';document.body.appendChild(statusDiv);function setStatus(m,c){statusDiv.textContent=m;if(c)statusDiv.style.background=c;}function cleanup(){if(document.body.contains(statusDiv))document.body.removeChild(statusDiv);}function downloadMarkdown(content,filename){const blob=new Blob([content],{type:'text/markdown'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href);}function sanitizeFilename(t){return t.replace(/[<>:"\/\\|?*]/g,'_').replace(/\s+/g,'_').replace(/_{2,}/g,'_').replace(/^_+|_+$/g,'').toLowerCase().substring(0,100);}function getConversationTitle(){const t=document.title?.trim();if(t&&t!=='Rovo'&&t.length>0)return sanitizeFilename(t);return'rovo_conversation';}function domToMarkdown(node){if(node.nodeType===Node.TEXT_NODE)return node.textContent;if(node.nodeType!==Node.ELEMENT_NODE)return'';const tag=node.tagName.toLowerCase();const children=Array.from(node.childNodes);function innerMd(){return children.map(domToMarkdown).join('');}switch(tag){case'p':{const t=innerMd().trim();return t?t+'\n\n':'';}case'h1':return`# ${innerMd().trim()}\n\n`;case'h2':return`## ${innerMd().trim()}\n\n`;case'h3':return`### ${innerMd().trim()}\n\n`;case'h4':return`#### ${innerMd().trim()}\n\n`;case'h5':return`##### ${innerMd().trim()}\n\n`;case'h6':return`###### ${innerMd().trim()}\n\n`;case'strong':case'b':{const t=innerMd().trim();return t?`**${t}**`:'';} case'em':case'i':{const t=innerMd().trim();return t?`_${t}_`:'';} case'code':return node.closest('pre')?node.textContent:`\`${node.textContent}\``;case'pre':{const ce=node.querySelector('code');const lang=(ce?.className||'').match(/language-(\w+)/)?.[1]||'';const code=ce?ce.textContent:node.textContent;return`\`\`\`${lang}\n${code}\n\`\`\`\n\n`;}case'ul':{const items=Array.from(node.children).filter(e=>e.tagName.toLowerCase()==='li').map(li=>`- ${domToMarkdown(li).trim().replace(/\n\n/g,'\n')}`).join('\n');return items+'\n\n';}case'ol':{const items=Array.from(node.children).filter(e=>e.tagName.toLowerCase()==='li').map((li,i)=>`${i+1}. ${domToMarkdown(li).trim().replace(/\n\n/g,'\n')}`).join('\n');return items+'\n\n';}case'li':return innerMd();case'br':return'\n';case'a':{const href=node.getAttribute('href')||'';const t=innerMd().trim();return href?`[${t}](${href})`:t;}case'blockquote':return innerMd().trim().split('\n').map(l=>`> ${l}`).join('\n')+'\n\n';case'hr':return'---\n\n';case'table':{const rows=Array.from(node.querySelectorAll('tr'));if(!rows.length)return'';const lines=[];rows.forEach((row,ri)=>{const cells=Array.from(row.querySelectorAll('th,td'));const texts=cells.map(c=>c.textContent.trim().replace(/\|/g,'\\|'));lines.push('| '+texts.join(' | ')+' |');if(ri===0)lines.push('| '+cells.map(()=>'---').join(' | ')+' |');});return lines.join('\n')+'\n\n';}case'svg':case'img':return'';default:return innerMd();}}function extractAllMessages(){const groups=document.querySelectorAll('[data-testid="rovo-chat-message-group"]');const messages=[];for(const group of groups){const uc=group.querySelector(SELECTORS.userContainer);if(uc){const doc=uc.querySelector(SELECTORS.rendererDoc);if(doc){const md=domToMarkdown(doc).trim();if(md)messages.push({type:'human',content:md});}}const rcs=group.querySelectorAll(SELECTORS.rovoContainer);for(const rc of rcs){const doc=rc.querySelector(SELECTORS.rendererDoc);if(doc){const md=domToMarkdown(doc).trim();if(md)messages.push({type:'rovo',content:md});}}}return messages;}function buildMarkdown(messages,title){const t=title.replace(/_/g,' ');let md=`# ${t}\n\n`;for(const msg of messages){if(msg.type==='human')md+=`## Human:\n\n${msg.content}\n\n---\n\n`;else md+=`## Rovo:\n\n${msg.content}\n\n---\n\n`;}return md;}function startExport(){try{setStatus('メッセージを解析中…');const messages=extractAllMessages();const hc=messages.filter(m=>m.type==='human').length;const rc=messages.filter(m=>m.type==='rovo').length;if(messages.length===0)throw new Error('メッセージが見つかりません。ページが完全に読み込まれているか確認してください。');setStatus(`Human: ${hc} | Rovo: ${rc} — ファイルを生成中…`);const title=getConversationTitle();const markdown=buildMarkdown(messages,title);const filename=`${title}.md`;downloadMarkdown(markdown,filename);setStatus(`✅ ダウンロード完了: ${filename}`,'#36B37E');}catch(error){setStatus(`❌ エラー: ${error.message}`,'#DE350B');console.error('エクスポート失敗:',error);}finally{setTimeout(cleanup,4000);}}setTimeout(startExport,500);}setupRovoExporter();})();
```

4. 保存する
5. 次回以降は Rovo チャットページでそのブックマークをクリックするだけでエクスポートできます

---

## 出力形式

ファイル名は `{会話タイトル}.md` として保存されます。

```markdown
# rovo - 2026 04 27 午後03 00

## Human:

explain-workflow Tell me the next possible statuses for PROJ-123

---

## Rovo:

Here's how you can update the status for this エピック.

**PROJ-123** is currently in the **'In Progress'** status, and can be moved to any of these statuses:

- **In Review**
- **Done**
- **On Hold**: This status will be available once you complete the following requirement...

---

## Human:

「In Progress」から「Done」にしたいのですが、権限が必要ですか？

---

## Rovo:

はい、「Done」への遷移には制限があります。...

---
```

---

## 仕組み

### なぜ完全 DOM パース方式にしたか

これまでのバージョンでは Rovo レスポンスの取得にクリップボード傍受（`navigator.clipboard.writeText` をラップ）を使用していましたが、以下の問題が発生しました。

| 問題 | 原因 |
| ---- | ---- |
| ユーザーメッセージの「コピー」ボタンが clipboard を呼ばない | ボタンは UI 装飾のみ（`opacity: 0` で非表示）で機能しない |
| ブックマークレット実行時に Rovo レスポンスが 0 件になる | `javascript:` URL からの実行ではクリップボード API の権限が付与されないケースがある |

そのため、**両メッセージとも `ak-renderer-document` を直接 DOM パースする方式**に統一しました。

### DOM 構造と区別方法

```
[data-testid="rovo-chat-message-group"]   ← 1ターン分のグループ
  ├─ [data-sentry-component="ContentContainer"]       ← ユーザーメッセージ
  │    └─ .ak-renderer-document  ← ここを DOM パース
  └─ [data-scroll-anchor="assistant-message"]         ← Rovo レスポンス
       └─ .ak-renderer-document  ← ここを DOM パース
```

グループを DOM 順に走査することで発言の順序を保証します。

### DOM パーサーの対応要素

```
p, h1〜h6, strong/b, em/i, code, pre, ul, ol, li, br, a, blockquote, hr, table
```

---

## 設定のカスタマイズ

### セレクターの更新

Rovo の UI が変更された場合は `SELECTORS` を更新してください。

```javascript
const SELECTORS = {
  // ユーザーメッセージのコンテナ
  userContainer: '[data-sentry-component="ContentContainer"]',

  // Rovo レスポンスのコンテナ
  rovoContainer: '[data-scroll-anchor="assistant-message"]',

  // 本文レンダラー（共通）
  rendererDoc: '.ak-renderer-document',
};
```

---

## トラブルシューティング

### ステータス表示の意味

| 表示 | 状態 |
| ---- | ---- |
| `メッセージを解析中…` | DOM を走査してメッセージを抽出中 |
| `Human: X \| Rovo: Y — ファイルを生成中…` | Markdown を生成してダウンロード中 |
| `✅ ダウンロード完了: xxx.md` | 成功 |
| `❌ エラー: …` | 失敗（メッセージを確認） |

### よくある問題

**件数が合わない（メッセージが抜ける）**

会話が長い場合、スクロールしていない部分は DOM に存在しないことがあります。ページを一番上から一番下までスクロールしてすべてのメッセージを DOM に展開してから実行してください。

**ファイル名が `rovo_conversation.md` になる**

ページタイトルから会話名を取得できませんでした。ファイルを手動でリネームしてください。

---

## バージョン履歴と変更理由

| バージョン | 主な変更 |
| --------- | ------- |
| v1 | ユーザー・Rovo ともにクリップボード傍受。ユーザーメッセージが常に 0 件（コピーボタンが clipboard を呼ばないため）|
| v2 | ユーザー: DOM パース / Rovo: クリップボード傍受のハイブリッド方式。ブックマークレット実行時に Rovo が 0 件になるケースが発生 |
| **v3（現行）** | **ユーザー・Rovo ともに DOM パース。クリップボード依存を完全排除** |

---

## ブラウザ対応

| ブラウザ | 対応状況 |
| -------- | ------- |
| Chrome / Chromium | ✅ 推奨 |
| Edge | ✅ |
| Firefox | ✅ |
| Safari | ✅ |

---

## プライバシーとセキュリティ

- **ローカル処理のみ** — すべての処理はブラウザ内で完結します
- **外部通信なし** — データは一切外部に送信されません
- **API 不使用** — Rovo の内部 API を呼び出しません

---

## ライセンス

MIT License

---

## 免責事項

このスクリプトは Atlassian 社と無関係のコミュニティ製ツールです。Atlassian の利用規約に従って責任を持ってご使用ください。Rovo の UI 更新により動作しなくなる場合があります。
