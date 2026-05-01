function setupRovoExporter() {
  // ============================================================
  // DOM Selectors
  // Rovo の UI が変更された場合はここを更新してください
  // ============================================================
  const SELECTORS = {
    // ユーザーメッセージのコンテナ
    // （ユーザーメッセージの本文はこの中にある）
    userContainer: '[data-sentry-component="ContentContainer"]',

    // Rovo レスポンスのコンテナ
    // （Rovo のレスポンス本文はこの中にある）
    rovoContainer: '[data-scroll-anchor="assistant-message"]',

    // 本文レンダラー（ユーザー・Rovo 共通）
    rendererDoc: '.ak-renderer-document',
  };

  // ============================================================
  // ステータス表示
  // ============================================================
  const statusDiv = document.createElement('div');
  statusDiv.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 10000;
    background: #0052CC; color: white; padding: 10px 15px;
    border-radius: 5px; font-family: monospace; font-size: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3); max-width: 300px;
  `;
  document.body.appendChild(statusDiv);

  function setStatus(message, color) {
    statusDiv.textContent = message;
    if (color) statusDiv.style.background = color;
  }

  function cleanup() {
    if (document.body.contains(statusDiv)) {
      document.body.removeChild(statusDiv);
    }
  }

  // ============================================================
  // ファイルダウンロード
  // ============================================================
  function downloadMarkdown(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // ============================================================
  // ファイル名生成
  // ============================================================
  function sanitizeFilename(text) {
    return text
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .substring(0, 100);
  }

  function getConversationTitle() {
    const pageTitle = document.title?.trim();
    if (pageTitle && pageTitle !== 'Rovo' && pageTitle.length > 0) {
      return sanitizeFilename(pageTitle);
    }
    return 'rovo_conversation';
  }

  // ============================================================
  // DOM → Markdown 変換
  //
  // ユーザーメッセージ・Rovo レスポンスの両方を DOM から直接取得する。
  //
  // 背景:
  //   ユーザーメッセージの「コピー」ボタンは clipboard.writeText を呼ばず、
  //   Rovo レスポンスのコピーボタンはクリップボードAPIの権限制限（ブックマークレット
  //   実行時のセキュリティポリシー等）により傍受できないケースがある。
  //   そのため両者ともに DOM から直接テキストを取得する方式を採用する。
  //
  // 変換ルール:
  //   - <p>              → テキスト + 改行
  //   - <h1>〜<h6>      → # 〜 ###### + テキスト
  //   - <strong> / <b>  → **テキスト**
  //   - <em> / <i>      → _テキスト_
  //   - <code>           → `テキスト`
  //   - <pre>            → ```コードブロック```
  //   - <ul> / <ol>     → - / 1. リスト
  //   - <br>             → 改行
  //   - <a>              → [テキスト](href)
  //   - <table>          → Markdown テーブル
  //   - <blockquote>     → > 引用
  // ============================================================

  function domToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes);

    function innerMd() {
      return children.map(domToMarkdown).join('');
    }

    switch (tag) {
      case 'p': {
        const text = innerMd().trim();
        return text ? text + '\n\n' : '';
      }

      case 'h1': return `# ${innerMd().trim()}\n\n`;
      case 'h2': return `## ${innerMd().trim()}\n\n`;
      case 'h3': return `### ${innerMd().trim()}\n\n`;
      case 'h4': return `#### ${innerMd().trim()}\n\n`;
      case 'h5': return `##### ${innerMd().trim()}\n\n`;
      case 'h6': return `###### ${innerMd().trim()}\n\n`;

      case 'strong':
      case 'b': {
        const text = innerMd().trim();
        return text ? `**${text}**` : '';
      }

      case 'em':
      case 'i': {
        const text = innerMd().trim();
        return text ? `_${text}_` : '';
      }

      case 'code': {
        if (node.closest('pre')) {
          return node.textContent;
        }
        return `\`${node.textContent}\``;
      }

      case 'pre': {
        const codeEl = node.querySelector('code');
        const lang = (codeEl?.className || '').match(/language-(\w+)/)?.[1] || '';
        const code = codeEl ? codeEl.textContent : node.textContent;
        return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
      }

      case 'ul': {
        const items = Array.from(node.children)
          .filter(el => el.tagName.toLowerCase() === 'li')
          .map(li => {
            const text = domToMarkdown(li).trim().replace(/\n\n/g, '\n');
            return `- ${text}`;
          })
          .join('\n');
        return items + '\n\n';
      }

      case 'ol': {
        const items = Array.from(node.children)
          .filter(el => el.tagName.toLowerCase() === 'li')
          .map((li, idx) => {
            const text = domToMarkdown(li).trim().replace(/\n\n/g, '\n');
            return `${idx + 1}. ${text}`;
          })
          .join('\n');
        return items + '\n\n';
      }

      case 'li':
        return innerMd();

      case 'br':
        return '\n';

      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = innerMd().trim();
        return href ? `[${text}](${href})` : text;
      }

      case 'blockquote':
        return innerMd().trim().split('\n').map(line => `> ${line}`).join('\n') + '\n\n';

      case 'hr':
        return '---\n\n';

      case 'table': {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (rows.length === 0) return '';

        const tableLines = [];
        rows.forEach((row, rowIdx) => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          const cellTexts = cells.map(cell => cell.textContent.trim().replace(/\|/g, '\\|'));
          tableLines.push('| ' + cellTexts.join(' | ') + ' |');
          if (rowIdx === 0) {
            tableLines.push('| ' + cells.map(() => '---').join(' | ') + ' |');
          }
        });

        return tableLines.join('\n') + '\n\n';
      }

      // レイアウト・コンテナ系（再帰的に処理）
      case 'div':
      case 'span':
      case 'section':
      case 'article':
      case 'main':
        return innerMd();

      // 無視する要素
      case 'svg':
      case 'img':
        return '';

      default:
        return innerMd();
    }
  }

  // ============================================================
  // メッセージグループ単位で会話を順序通りに取得
  //
  // DOM 構造（確認済み）:
  //   [data-testid="rovo-chat-message-group"]  ← 1ターン分のグループ
  //     ├─ [data-sentry-component="ContentContainer"]  ← ユーザーメッセージ
  //     │    └─ .ak-renderer-document
  //     └─ [data-scroll-anchor="assistant-message"]    ← Rovo レスポンス
  //          └─ .ak-renderer-document
  //
  // グループを DOM 順に走査することで発言順序を保証する。
  // ============================================================

  function extractAllMessages() {
    const groups = document.querySelectorAll('[data-testid="rovo-chat-message-group"]');
    const messages = [];

    for (const group of groups) {
      // ユーザーメッセージ
      const userContainer = group.querySelector(SELECTORS.userContainer);
      if (userContainer) {
        const doc = userContainer.querySelector(SELECTORS.rendererDoc);
        if (doc) {
          const md = domToMarkdown(doc).trim();
          if (md) {
            messages.push({ type: 'human', content: md });
          }
        }
      }

      // Rovo レスポンス（グループ内に複数ある場合も考慮）
      const rovoContainers = group.querySelectorAll(SELECTORS.rovoContainer);
      for (const rovoContainer of rovoContainers) {
        const doc = rovoContainer.querySelector(SELECTORS.rendererDoc);
        if (doc) {
          const md = domToMarkdown(doc).trim();
          if (md) {
            messages.push({ type: 'rovo', content: md });
          }
        }
      }
    }

    return messages;
  }

  // ============================================================
  // Markdown 生成
  // ============================================================
  function buildMarkdown(messages, title) {
    const displayTitle = title.replace(/_/g, ' ');
    let markdown = `# ${displayTitle}\n\n`;

    for (const msg of messages) {
      if (msg.type === 'human') {
        markdown += `## Human:\n\n${msg.content}\n\n---\n\n`;
      } else {
        markdown += `## Rovo:\n\n${msg.content}\n\n---\n\n`;
      }
    }

    return markdown;
  }

  // ============================================================
  // メインのエクスポート処理
  // ============================================================
  function startExport() {
    try {
      setStatus('メッセージを解析中…');

      const messages = extractAllMessages();

      const humanCount = messages.filter(m => m.type === 'human').length;
      const rovoCount = messages.filter(m => m.type === 'rovo').length;

      console.log(`✅ ユーザーメッセージ: ${humanCount} 件`);
      console.log(`✅ Rovo レスポンス: ${rovoCount} 件`);

      if (messages.length === 0) {
        throw new Error('メッセージが見つかりません。ページが完全に読み込まれているか確認してください。');
      }

      setStatus(`Human: ${humanCount} | Rovo: ${rovoCount} — ファイルを生成中…`);

      const title = getConversationTitle();
      const markdown = buildMarkdown(messages, title);
      const filename = `${title}.md`;

      downloadMarkdown(markdown, filename);

      setStatus(`✅ ダウンロード完了: ${filename}`, '#36B37E');
      console.log(`🎉 エクスポート完了: ${filename}`);

    } catch (error) {
      setStatus(`❌ エラー: ${error.message}`, '#DE350B');
      console.error('エクスポート失敗:', error);
    } finally {
      setTimeout(cleanup, 4000);
    }
  }

  // 少し遅らせてページの準備を待つ
  setTimeout(startExport, 500);
}

setupRovoExporter();
