# 日本国憲法　穴埋め学習

社会の授業向けの、日本国憲法（前文・第一条〜第二十八条）の穴埋め学習アプリです。

ブラウザだけで動く静的サイトで、空欄に語句を入力して採点できます。

## 機能

- 前文および第一条〜第二十八条の穴埋め問題（`index.html`）
- 授業向け抽出セットの穴埋め問題（`study.html`）
- 憲法条文小テスト ver.1（`quiz.html`・全30問・解答欄つき）
- 前文から第百三条までのマインドマップ（`map.html`）
- 条文ごとのナビゲーション（前へ / 次へ）
- 採点・進捗・正答率の表示
- ヒント（先頭1文字）
- 答えの表示・リセット
- 学習進捗の `localStorage` 保存（ページを閉じても続きから再開）

旧字体・歴史的仮名遣いは原文どおりです。カタカナ／ひらがなは同一視して採点します。

## 使い方

1. リポジトリをクローンする

```bash
git clone https://github.com/econanringo/the-japanese-constitution.git
cd the-japanese-constitution
```

2. ブラウザでページを開く

| ページ | 内容 |
| --- | --- |
| `index.html` | 前文・第一条〜第二十八条 |
| `study.html` | 授業で指定された条文だけ（99・98・前文・1・4①・11・13・14・19・20①・21①・23・24・33・22①・15③・26・25・27・28・16・32・12） |
| `quiz.html` | 憲法条文小テスト ver.1（第1・3・11〜14・19〜26・33条／全30問） |
| `map.html` | 前文から第百三条までのマインドマップ |

ローカルサーバーを使う場合の例:

```bash
# Python
python3 -m http.server 8080

# または npx
npx serve .
```

ブラウザで `http://localhost:8080`、`http://localhost:8080/study.html`、`http://localhost:8080/quiz.html`、または `http://localhost:8080/map.html` を開いてください。

3. 空欄に語句を入力し、「採点する」を押す

## ファイル構成

| ファイル | 内容 |
| --- | --- |
| `index.html` | 全文セットのページ |
| `study.html` | 抽出セットのページ |
| `quiz.html` | 小テスト ver.1 のページ |
| `map.html` | マインドマップのページ |
| `style.css` | スタイル |
| `app.js` | 穴埋めの表示・採点・進捗管理 |
| `quiz.js` | 小テストの表示・採点 |
| `map.js` | マインドマップの配置・操作 |
| `map-data.js` | マインドマップの枝データ |
| `data.js` | 全文セットの問題データ |
| `study-data.js` | 抽出セットの問題データ |
| `quiz-data.js` | 小テストの問題・解答データ |
| `日本国憲法.md` | 憲法全文（参照用） |

## 問題データの形式

`data.js` 内の `[[答え]]` で囲んだ語句が穴埋めになります。

```js
{
  id: "art1",
  chapter: "第一章　天皇",
  title: "第一条",
  passages: [
    {
      text: "天皇は、日本国の[[象徴]]であり日本国民統合の[[象徴]]であつて、この地位は、[[主権]]の存する日本国民の[[総意]]に基く。"
    }
  ]
}
```

## 出典

憲法本文は [atsuya/constitution-of-japan](https://github.com/atsuya/constitution-of-japan) を参照しています。
